package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

func itoa(n int) string { return strconv.Itoa(n) }
func visibleMessage(a string, param int) string {
	p := "$" + itoa(param)
	return a + `."deletedAt" IS NULL AND (` + a + `."deletedForUserId" IS NULL OR ` + a + `."deletedForUserId"<>` + p + `) AND NOT EXISTS(SELECT 1 FROM message_delivery_status ds WHERE ds."messageId"=` + a + `.id AND ds."userId"=` + p + ` AND ds."hiddenAt" IS NOT NULL) AND EXISTS(SELECT 1 FROM "ConversationParticipant" cp WHERE cp."conversationId"=` + a + `."conversationId" AND cp."userId"=` + p + `)`
}
func messageExpr(a string, param int) string {
	return `jsonb_build_object('id',` + a + `.id,'conversationId',` + a + `."conversationId",'senderId',` + a + `."senderId",'content',` + a + `.content,'createdAt',` + a + `."createdAt",'editedAt',` + a + `."editedAt",'mediaUrl',` + a + `."mediaUrl",'mediaType',` + a + `."mediaType",'mediaName',` + a + `."mediaName",'sender',(SELECT ` + userExpr("su") + ` FROM "User" su WHERE su.id=` + a + `."senderId"),'replyTo',(SELECT jsonb_build_object('id',rm.id,'content',rm.content,'senderId',rm."senderId",'sender',(SELECT ` + userExpr("ru") + ` FROM "User" ru WHERE ru.id=rm."senderId")) FROM "Message" rm WHERE rm.id=` + a + `."replyToId" AND ` + visibleMessage("rm", param) + `),'reactions',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',re.id,'emoji',re.emoji,'userId',re."userId",'user',(SELECT ` + userExpr("eu") + ` FROM "User" eu WHERE eu.id=re."userId"))) FROM message_reactions re WHERE re."messageId"=` + a + `.id),'[]'::jsonb),'pinnedBy',(SELECT jsonb_build_object('id',pin."pinnedById",'pinnedAt',pin."pinnedAt") FROM "pinned_messages" pin WHERE pin."messageId"=` + a + `.id LIMIT 1))`
}
func (s *Server) decryptMessage(item M) (M, error) {
	content, err := decryptText(s.cfg.EncryptionKey, str(item, "content"))
	if err != nil {
		return nil, err
	}
	item["content"] = content
	if reply, ok := item["replyTo"].(map[string]any); ok {
		content, err := decryptText(s.cfg.EncryptionKey, str(reply, "content"))
		if err != nil {
			return nil, err
		}
		reply["content"] = content
	}
	return item, nil
}
func (s *Server) getMessage(ctx context.Context, q Querier, id, user string) (M, error) {
	value, err := one(ctx, q, `SELECT `+messageExpr("m", 2)+` FROM "Message" m WHERE m.id=$1 AND `+visibleMessage("m", 2), id, user)
	if err != nil {
		return nil, err
	}
	return s.decryptMessage(value)
}
func member(ctx context.Context, q Querier, conversation, user string) error {
	ok, err := exists(ctx, q, `SELECT 1 FROM "ConversationParticipant" WHERE "conversationId"=$1 AND "userId"=$2`, conversation, user)
	if err != nil {
		return err
	}
	if !ok {
		return denied()
	}
	return nil
}
func (s *Server) messages(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	cid := r.PathValue("id")
	if err := member(r.Context(), s.db, cid, u.ID); err != nil {
		return nil, err
	}
	if r.Method == "POST" {
		return s.sendMessage(w, r, u)
	}
	cursor := r.URL.Query().Get("cursor")
	limit := integer(r.URL.Query().Get("limit"), 50, 100)
	var timestamp any
	cursorID := ""
	if cursor != "" {
		parts := strings.SplitN(cursor, "|", 2)
		t, err := time.Parse(time.RFC3339Nano, parts[0])
		if err != nil {
			return nil, bad("Некорректный курсор")
		}
		timestamp = t
		if len(parts) > 1 {
			cursorID = parts[1]
		}
	}
	items, err := many(r.Context(), s.db, `SELECT `+messageExpr("m", 2)+` FROM "Message" m WHERE m."conversationId"=$1 AND `+visibleMessage("m", 2)+` AND ($3::timestamp IS NULL OR m."createdAt"<$3 OR (m."createdAt"=$3 AND m.id<$4)) ORDER BY m."createdAt" DESC,m.id DESC LIMIT $5`, cid, u.ID, timestamp, cursorID, limit+1)
	if err != nil {
		return nil, err
	}
	more := len(items) > limit
	if more {
		items = items[:limit]
	}
	var next any
	if more && len(items) > 0 {
		last := items[len(items)-1]
		next = str(last, "createdAt") + "|" + str(last, "id")
	}
	if cursor == "" && len(items) > 0 {
		_, err = s.db.ExecContext(r.Context(), `UPDATE "ConversationParticipant" SET "lastReadAt"=$1 WHERE "conversationId"=$2 AND "userId"=$3 AND "lastReadAt"<$1`, str(items[0], "createdAt"), cid, u.ID)
		if err != nil {
			return nil, err
		}
	}
	for i := range items {
		items[i], err = s.decryptMessage(items[i])
		if err != nil {
			return nil, err
		}
	}
	for i, j := 0, len(items)-1; i < j; i, j = i+1, j-1 {
		items[i], items[j] = items[j], items[i]
	}
	pins, err := s.pinnedList(r.Context(), cid, u.ID)
	if err != nil {
		return nil, err
	}
	return M{"messages": items, "nextCursor": next, "pinnedMessages": pins}, nil
}
func (s *Server) sendMessage(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	cid := r.PathValue("id")
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	content, err := textValue(b, "content", 5000, false)
	if err != nil {
		return nil, err
	}
	temp := str(b, "tempId")
	if len(temp) > 128 {
		return nil, bad("Некорректный идентификатор запроса")
	}
	media, kind, name := str(b, "mediaUrl"), str(b, "mediaType"), str(b, "mediaName")
	if len(name) > 255 || len(media) > 1024 {
		return nil, bad("Некорректное вложение")
	}
	if media != "" && kind != "image" && kind != "video" && kind != "file" {
		return nil, bad("Некорректный тип вложения")
	}
	if content == "" && media == "" && str(b, "forwardFromId") == "" {
		return nil, bad("Сообщение пустое")
	}
	if !s.limits.allow("send:"+u.ID, 60, time.Minute) {
		return nil, &apiError{429, "Слишком много сообщений"}
	}
	id := newID()
	if temp != "" {
		parts, _ := json.Marshal([]string{u.ID, cid, temp})
		id = "msg_" + digest(string(parts))
	}
	existing, err := s.getMessage(r.Context(), s.db, id, u.ID)
	if err == nil {
		existing["tempId"] = temp
		return existing, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	var sent M
	err = s.transaction(r.Context(), func(q Querier) error {
		if err := member(r.Context(), q, cid, u.ID); err != nil {
			return err
		}
		blocked, err := exists(r.Context(), q, `SELECT 1 FROM user_blocks b JOIN "ConversationParticipant" cp ON cp."conversationId"=$1 JOIN "Conversation" c ON c.id=cp."conversationId" WHERE c.type='direct' AND ((b."blockerId"=$2 AND b."blockedId"=cp."userId") OR (b."blockedId"=$2 AND b."blockerId"=cp."userId"))`, cid, u.ID)
		if err != nil {
			return err
		}
		if blocked {
			return denied()
		}
		if reply := str(b, "replyToId"); reply != "" {
			ok, err := exists(r.Context(), q, `SELECT 1 FROM "Message" m WHERE m.id=$1 AND m."conversationId"=$2 AND `+visibleMessage("m", 3), reply, cid, u.ID)
			if err != nil {
				return err
			}
			if !ok {
				return bad("Сообщение для ответа недоступно")
			}
		}
		if forward := str(b, "forwardFromId"); forward != "" {
			source, err := s.getMessage(r.Context(), q, forward, u.ID)
			if err != nil {
				return denied()
			}
			if content == "" {
				content = str(source, "content")
			}
		}
		if media != "" {
			allowed, err := s.canAttachWith(r.Context(), q, media, u.ID)
			if err != nil {
				return err
			}
			if !allowed {
				return denied()
			}
		}
		encrypted, err := encryptText(s.cfg.EncryptionKey, content)
		if err != nil {
			return err
		}
		_, err = q.ExecContext(r.Context(), `INSERT INTO "Message"(id,"conversationId","senderId",content,"searchContent","replyToId","forwardFromId","mediaUrl","mediaType","mediaName") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING`, id, cid, u.ID, encrypted, nullable(content), nullable(str(b, "replyToId")), nullable(str(b, "forwardFromId")), nullable(media), nullable(kind), nullable(name))
		if err != nil {
			return err
		}
		_, err = q.ExecContext(r.Context(), `UPDATE "Conversation" SET "lastMessageAt"=(SELECT "createdAt" FROM "Message" WHERE id=$1),"updatedAt"=now() WHERE id=$2`, id, cid)
		if err != nil {
			return err
		}
		_, err = q.ExecContext(r.Context(), `INSERT INTO message_delivery_status(id,"messageId","userId",status) SELECT $1||cp."userId",$2,cp."userId",CASE WHEN cp."userId"=$3 THEN 'sent' ELSE 'delivered' END FROM "ConversationParticipant" cp WHERE cp."conversationId"=$4 ON CONFLICT("messageId","userId") DO NOTHING`, newID(), id, u.ID, cid)
		if err != nil {
			return err
		}
		sent, err = s.getMessage(r.Context(), q, id, u.ID)
		return err
	})
	if err != nil {
		return nil, err
	}
	sent["tempId"] = temp
	s.publish(cid, "message:new", sent)
	return sent, nil
}
func (s *Server) message(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	id := r.PathValue("messageId")
	message, err := s.getMessage(r.Context(), s.db, id, u.ID)
	if err != nil {
		return nil, err
	}
	if r.Method == "GET" {
		return message, nil
	}
	cid := str(message, "conversationId")
	if r.Method == "DELETE" {
		mode := r.URL.Query().Get("mode")
		if mode == "" {
			mode = "forMe"
		}
		if mode == "forEveryone" {
			if str(message, "senderId") != u.ID {
				return nil, denied()
			}
			err = affected(s.db.ExecContext(r.Context(), `UPDATE "Message" SET "deletedAt"=$1 WHERE id=$2 AND "senderId"=$3`, now(), id, u.ID))
			if err == nil {
				s.publish(cid, "messages:changed", M{"conversationId": cid, "messageId": id})
			}
		} else if mode == "forMe" {
			_, err = s.db.ExecContext(r.Context(), `INSERT INTO message_delivery_status(id,"messageId","userId",status,"hiddenAt") VALUES($1,$2,$3,'delivered',$4) ON CONFLICT("messageId","userId") DO UPDATE SET "hiddenAt"=excluded."hiddenAt"`, newID(), id, u.ID, now())
			if err == nil {
				s.hub.publish(u.ID, "messages:changed", M{"conversationId": cid, "messageId": id})
			}
		} else {
			return nil, bad("Некорректный способ удаления")
		}
		return M{"success": true, "mode": mode}, err
	}
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	content, err := textValue(b, "content", 5000, true)
	if err != nil {
		return nil, err
	}
	if str(message, "senderId") != u.ID {
		return nil, denied()
	}
	encrypted, err := encryptText(s.cfg.EncryptionKey, content)
	if err != nil {
		return nil, err
	}
	edited := now()
	err = s.transaction(r.Context(), func(q Querier) error {
		var old string
		if err := q.QueryRowContext(r.Context(), `SELECT content FROM "Message" WHERE id=$1 AND "senderId"=$2 AND "deletedAt" IS NULL FOR UPDATE`, id, u.ID).Scan(&old); err != nil {
			return err
		}
		if _, err := q.ExecContext(r.Context(), `INSERT INTO message_edit_history(id,"messageId","oldContent") VALUES($1,$2,$3)`, newID(), id, old); err != nil {
			return err
		}
		return affected(q.ExecContext(r.Context(), `UPDATE "Message" SET content=$1,"searchContent"=$2,"editedAt"=$3 WHERE id=$4`, encrypted, content, edited, id))
	})
	if err != nil {
		return nil, err
	}
	s.publish(cid, "messages:changed", M{"conversationId": cid, "messageId": id})
	return M{"success": true, "content": content, "editedAt": edited}, nil
}
func (s *Server) reaction(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	id := r.PathValue("messageId")
	message, err := s.getMessage(r.Context(), s.db, id, u.ID)
	if err != nil {
		return nil, err
	}
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	emoji := str(b, "emoji")
	if len([]rune(emoji)) < 1 || len([]rune(emoji)) > 10 {
		return nil, bad("Некорректная реакция")
	}
	action := "removed"
	err = s.transaction(r.Context(), func(q Querier) error {
		var lock string
		if err := q.QueryRowContext(r.Context(), `SELECT id FROM "Message" WHERE id=$1 FOR UPDATE`, id).Scan(&lock); err != nil {
			return err
		}
		result, err := q.ExecContext(r.Context(), `DELETE FROM message_reactions WHERE "messageId"=$1 AND "userId"=$2 AND emoji=$3`, id, u.ID, emoji)
		if err != nil {
			return err
		}
		n, _ := result.RowsAffected()
		if n == 0 {
			action = "added"
			_, err = q.ExecContext(r.Context(), `INSERT INTO message_reactions(id,"messageId","userId",emoji) VALUES($1,$2,$3,$4)`, newID(), id, u.ID, emoji)
		}
		return err
	})
	if err == nil {
		s.publish(str(message, "conversationId"), "messages:changed", M{"conversationId": message["conversationId"], "messageId": id})
	}
	return M{"action": action}, err
}
func (s *Server) pinnedList(ctx context.Context, cid, user string) ([]M, error) {
	items, err := many(ctx, s.db, `SELECT `+messageExpr("m", 2)+` FROM "pinned_messages" pin JOIN "Message" m ON m.id=pin."messageId" WHERE pin."conversationId"=$1 AND `+visibleMessage("m", 2)+` ORDER BY pin."pinnedAt" DESC LIMIT 20`, cid, user)
	if err != nil {
		return nil, err
	}
	for i := range items {
		items[i], err = s.decryptMessage(items[i])
		if err != nil {
			return nil, err
		}
	}
	return items, nil
}
func (s *Server) pinMessage(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	cid := r.PathValue("id")
	if err := member(r.Context(), s.db, cid, u.ID); err != nil {
		return nil, err
	}
	if r.Method == "GET" {
		items, err := s.pinnedList(r.Context(), cid, u.ID)
		return M{"messages": items}, err
	}
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	id := str(b, "messageId")
	message, err := s.getMessage(r.Context(), s.db, id, u.ID)
	if err != nil {
		return nil, err
	}
	if str(message, "conversationId") != cid {
		return nil, denied()
	}
	pinned := false
	err = s.transaction(r.Context(), func(q Querier) error {
		var lock string
		if err := q.QueryRowContext(r.Context(), `SELECT id FROM "Message" WHERE id=$1 FOR UPDATE`, id).Scan(&lock); err != nil {
			return err
		}
		result, err := q.ExecContext(r.Context(), `DELETE FROM pinned_messages WHERE "conversationId"=$1 AND "messageId"=$2`, cid, id)
		if err != nil {
			return err
		}
		count, _ := result.RowsAffected()
		pinned = count == 0
		if pinned {
			_, err = q.ExecContext(r.Context(), `INSERT INTO pinned_messages(id,"conversationId","messageId","pinnedById") VALUES($1,$2,$3,$4)`, newID(), cid, id, u.ID)
		}
		return err
	})
	if err == nil {
		s.publish(cid, "messages:changed", M{"conversationId": cid, "messageId": id})
	}
	return M{"pinned": pinned}, err
}
func (s *Server) messageSearch(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	cid := r.PathValue("id")
	if err := member(r.Context(), s.db, cid, u.ID); err != nil {
		return nil, err
	}
	query := r.URL.Query().Get("q")
	if query == "" || len(query) > 200 {
		return nil, bad("Некорректный запрос")
	}
	items, err := many(r.Context(), s.db, `SELECT `+messageExpr("m", 2)+` FROM "Message" m WHERE m."conversationId"=$1 AND `+visibleMessage("m", 2)+` AND m."searchContent" ILIKE $3 ORDER BY m."createdAt" DESC LIMIT 30`, cid, u.ID, "%"+escapeLike(query)+"%")
	if err != nil {
		return nil, err
	}
	for i := range items {
		items[i], err = s.decryptMessage(items[i])
		if err != nil {
			return nil, err
		}
	}
	return M{"messages": items}, nil
}
func (s *Server) media(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	cid := r.PathValue("id")
	if err := member(r.Context(), s.db, cid, u.ID); err != nil {
		return nil, err
	}
	var before any
	if cursor := r.URL.Query().Get("cursor"); cursor != "" {
		t, err := time.Parse(time.RFC3339Nano, cursor)
		if err != nil {
			return nil, bad("Некорректный курсор")
		}
		before = t
	}
	items, err := many(r.Context(), s.db, `SELECT `+messageExpr("m", 2)+` FROM "Message" m WHERE m."conversationId"=$1 AND `+visibleMessage("m", 2)+` AND m."mediaUrl" IS NOT NULL AND ($3='' OR m."mediaType"=$3) AND ($4::timestamp IS NULL OR m."createdAt"<$4) ORDER BY m."createdAt" DESC,m.id DESC LIMIT 21`, cid, u.ID, r.URL.Query().Get("type"), before)
	if err != nil {
		return nil, err
	}
	var cursor any
	if len(items) > 20 {
		items = items[:20]
		cursor = items[19]["createdAt"]
	}
	for i := range items {
		items[i], err = s.decryptMessage(items[i])
		if err != nil {
			return nil, err
		}
	}
	return M{"media": items, "nextCursor": cursor}, nil
}

// Sorted IDs provide a stable lock key for concurrent creation of the same direct chat.
func participantKey(ids []string) string {
	copyIDs := append([]string{}, ids...)
	sort.Strings(copyIDs)
	return strings.Join(copyIDs, ":")
}
