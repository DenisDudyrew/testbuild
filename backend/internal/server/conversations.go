package server

import (
	"context"
	"database/sql"
	"net/http"
	"time"
)

func conversationExpr(a string, userParam int) string {
	p := "$" + itoa(userParam)
	return `to_jsonb(` + a + `) || jsonb_build_object('participants',COALESCE((SELECT jsonb_agg(` + userExpr("cu") + ` || jsonb_build_object('lastSeenAt',cu."lastSeenAt") ORDER BY cu.id) FROM "ConversationParticipant" cp JOIN "User" cu ON cu.id=cp."userId" WHERE cp."conversationId"=` + a + `.id),'[]'::jsonb),'lastReadAt',(SELECT cp."lastReadAt" FROM "ConversationParticipant" cp WHERE cp."conversationId"=` + a + `.id AND cp."userId"=` + p + `),'isPinned',EXISTS(SELECT 1 FROM "ConversationParticipant" cp WHERE cp."conversationId"=` + a + `.id AND cp."userId"=` + p + ` AND cp."pinnedAt" IS NOT NULL),'unreadCount',(SELECT count(*) FROM "Message" m WHERE m."conversationId"=` + a + `.id AND m."senderId"<>` + p + ` AND ` + visibleMessage("m", userParam) + ` AND m."createdAt">(SELECT cp."lastReadAt" FROM "ConversationParticipant" cp WHERE cp."conversationId"=` + a + `.id AND cp."userId"=` + p + `)),'lastMessage',(SELECT ` + messageExpr("m", userParam) + ` FROM "Message" m WHERE m."conversationId"=` + a + `.id AND ` + visibleMessage("m", userParam) + ` ORDER BY m."createdAt" DESC,m.id DESC LIMIT 1))`
}
func (s *Server) decryptConversation(item M) (M, error) {
	if last, ok := item["lastMessage"].(map[string]any); ok {
		message, err := s.decryptMessage(last)
		if err != nil {
			return nil, err
		}
		item["lastMessage"] = message
	}
	return item, nil
}
func (s *Server) getConversation(ctx context.Context, q Querier, id, user string) (M, error) {
	item, err := one(ctx, q, `SELECT `+conversationExpr("c", 2)+` FROM "Conversation" c WHERE c.id=$1 AND EXISTS(SELECT 1 FROM "ConversationParticipant" cp WHERE cp."conversationId"=c.id AND cp."userId"=$2)`, id, user)
	if err != nil {
		return nil, err
	}
	return s.decryptConversation(item)
}
func (s *Server) conversations(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	if r.Method == "GET" {
		items, err := many(r.Context(), s.db, `SELECT `+conversationExpr("c", 1)+` FROM "Conversation" c WHERE EXISTS(SELECT 1 FROM "ConversationParticipant" cp WHERE cp."conversationId"=c.id AND cp."userId"=$1) ORDER BY c."lastMessageAt" DESC,c.id DESC LIMIT 200`, u.ID)
		if err != nil {
			return nil, err
		}
		for i := range items {
			items[i], err = s.decryptConversation(items[i])
			if err != nil {
				return nil, err
			}
		}
		return items, nil
	}
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	ids, ok := arrayStrings(b["participantIds"])
	if !ok || len(ids) < 1 || len(ids) > 99 {
		return nil, bad("Нужно выбрать от 1 до 99 собеседников")
	}
	name, err := textValue(b, "name", 200, false)
	if b["name"] == nil {
		err = nil
	}
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{u.ID: true}
	for _, id := range ids {
		if seen[id] {
			return nil, bad("Участники повторяются")
		}
		seen[id] = true
	}
	all := append([]string{u.ID}, ids...)
	conversationID := newID()
	kind := "direct"
	if len(ids) > 1 || name != "" {
		kind = "group"
	}
	err = s.transaction(r.Context(), func(q Querier) error {
		_, err := q.ExecContext(r.Context(), `SELECT pg_advisory_xact_lock(hashtext($1))`, participantKey(all))
		if err != nil {
			return err
		}
		var count int
		if err = q.QueryRowContext(r.Context(), `SELECT count(*) FROM "User" WHERE id=ANY($1) AND "emailVerified" AND password<>'__pending__'`, all).Scan(&count); err != nil {
			return err
		}
		if count != len(all) {
			return bad("Один из пользователей недоступен")
		}
		blocked, err := exists(r.Context(), q, `SELECT 1 FROM user_blocks WHERE ("blockerId"=$1 AND "blockedId"=ANY($2)) OR ("blockedId"=$1 AND "blockerId"=ANY($2))`, u.ID, ids)
		if err != nil {
			return err
		}
		if blocked {
			return denied()
		}
		if kind == "direct" {
			var existing string
			err = q.QueryRowContext(r.Context(), `SELECT c.id FROM "Conversation" c WHERE c.type='direct' AND (SELECT count(*) FROM "ConversationParticipant" cp WHERE cp."conversationId"=c.id)=2 AND EXISTS(SELECT 1 FROM "ConversationParticipant" cp WHERE cp."conversationId"=c.id AND cp."userId"=$1) AND EXISTS(SELECT 1 FROM "ConversationParticipant" cp WHERE cp."conversationId"=c.id AND cp."userId"=$2) ORDER BY c."createdAt" LIMIT 1`, u.ID, ids[0]).Scan(&existing)
			if err == nil {
				conversationID = existing
				return nil
			}
			if err != sql.ErrNoRows {
				return err
			}
		}
		if _, err = q.ExecContext(r.Context(), `INSERT INTO "Conversation"(id,type,name,"updatedAt") VALUES($1,$2,$3,$4)`, conversationID, kind, nullable(name), now()); err != nil {
			return err
		}
		for _, id := range all {
			if _, err = q.ExecContext(r.Context(), `INSERT INTO "ConversationParticipant"("conversationId","userId") VALUES($1,$2)`, conversationID, id); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	s.publish(conversationID, "conversation:update", M{"conversationId": conversationID})
	return s.getConversation(r.Context(), s.db, conversationID, u.ID)
}
func (s *Server) conversation(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	cid := r.PathValue("id")
	if err := member(r.Context(), s.db, cid, u.ID); err != nil {
		return nil, err
	}
	if r.Method == "GET" {
		return s.getConversation(r.Context(), s.db, cid, u.ID)
	}
	if r.Method == "DELETE" {
		mode := r.URL.Query().Get("mode")
		if mode == "delete" {
			err := affected(s.db.ExecContext(r.Context(), `DELETE FROM "Conversation" c WHERE id=$1 AND (SELECT count(*) FROM "ConversationParticipant" cp WHERE cp."conversationId"=c.id)=1`, cid))
			return M{"success": true, "mode": "delete"}, err
		}
		if mode != "" && mode != "leave" {
			return nil, bad("Некорректный режим")
		}
		_, err := s.db.ExecContext(r.Context(), `DELETE FROM "ConversationParticipant" WHERE "conversationId"=$1 AND "userId"=$2`, cid, u.ID)
		if err == nil {
			s.hub.publish(u.ID, "conversation:update", M{"conversationId": cid})
			s.publish(cid, "conversation:update", M{"conversationId": cid})
		}
		return M{"success": true, "mode": "leave"}, err
	}
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	name, hasName := b["name"]
	kind, hasType := b["type"]
	if hasName {
		if name != nil {
			if _, err := textValue(b, "name", 200, false); err != nil {
				return nil, err
			}
		}
	}
	if hasType {
		if u.Role != "admin" {
			return nil, denied()
		}
		if kind != "direct" && kind != "group" {
			return nil, bad("Некорректный тип чата")
		}
	}
	if err = affected(s.db.ExecContext(r.Context(), `UPDATE "Conversation" SET name=CASE WHEN $1 THEN $2 ELSE name END,type=CASE WHEN $3 THEN $4 ELSE type END,"updatedAt"=now() WHERE id=$5`, hasName, name, hasType, kind, cid)); err != nil {
		return nil, err
	}
	s.publish(cid, "conversation:update", M{"conversationId": cid})
	return s.getConversation(r.Context(), s.db, cid, u.ID)
}
func (s *Server) unread(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	var count int
	err := s.db.QueryRowContext(r.Context(), `SELECT count(*) FROM "Message" m JOIN "ConversationParticipant" cp ON cp."conversationId"=m."conversationId" AND cp."userId"=$1 WHERE m."senderId"<>$1 AND m."createdAt">cp."lastReadAt" AND `+visibleMessage("m", 1), u.ID).Scan(&count)
	return M{"unreadCount": count}, err
}
func (s *Server) block(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	if r.Method == "GET" {
		return many(r.Context(), s.db, `SELECT to_jsonb(b) || jsonb_build_object('blocked',(SELECT `+userExpr("bu")+` FROM "User" bu WHERE bu.id=b."blockedId")) FROM user_blocks b WHERE b."blockerId"=$1 ORDER BY b."createdAt" DESC`, u.ID)
	}
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	target := str(b, "userId")
	if target == "" || target == u.ID {
		return nil, bad("Некорректный пользователь")
	}
	if r.Method == "DELETE" {
		_, err = s.db.ExecContext(r.Context(), `DELETE FROM user_blocks WHERE "blockerId"=$1 AND "blockedId"=$2`, u.ID, target)
	} else {
		_, err = s.db.ExecContext(r.Context(), `INSERT INTO user_blocks(id,"blockerId","blockedId") VALUES($1,$2,$3) ON CONFLICT("blockerId","blockedId") DO NOTHING`, newID(), u.ID, target)
	}
	return success(), err
}
func (s *Server) typing(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	cid := r.PathValue("id")
	if err := member(r.Context(), s.db, cid, u.ID); err != nil {
		return nil, err
	}
	if r.Method != "GET" {
		if !s.limits.allow("typing:"+u.ID, 60, time.Minute) {
			return success(), nil
		}
		var at any
		if r.Method == "POST" {
			at = now()
		}
		if _, err := s.db.ExecContext(r.Context(), `UPDATE "ConversationParticipant" SET "typingAt"=$1 WHERE "conversationId"=$2 AND "userId"=$3`, at, cid, u.ID); err != nil {
			return nil, err
		}
	}
	items, err := many(r.Context(), s.db, `SELECT jsonb_build_object('id',u.id,'username',u.username) FROM "ConversationParticipant" cp JOIN "User" u ON u.id=cp."userId" WHERE cp."conversationId"=$1 AND cp."typingAt">now()-interval '5 seconds' ORDER BY u.id`, cid)
	if err != nil {
		return nil, err
	}
	if r.Method != "GET" {
		s.publish(cid, "typing:update", M{"conversationId": cid, "typing": items})
	}
	return M{"conversationId": cid, "typing": items}, nil
}
