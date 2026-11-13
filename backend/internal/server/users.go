package server

import (
	"context"
	"golang.org/x/crypto/bcrypt"
	"net/http"
	"strings"
	"time"
)

func profileExpr(a string) string {
	return `jsonb_build_object('id',` + a + `.id,'username',` + a + `.username,'avatar',` + a + `.avatar,'header',` + a + `.header,'bio',` + a + `.bio,'createdAt',` + a + `."createdAt",'lastSeenAt',` + a + `."lastSeenAt",'_count',jsonb_build_object('posts',(SELECT count(*) FROM "Post" p WHERE p."userId"=` + a + `.id),'likes',(SELECT count(*) FROM "Like" l WHERE l."userId"=` + a + `.id),'comments',(SELECT count(*) FROM "Comment" c WHERE c."userId"=` + a + `.id),'followers',(SELECT count(*) FROM follows f WHERE f."followingId"=` + a + `.id),'following',(SELECT count(*) FROM follows f WHERE f."followerId"=` + a + `.id)))`
}
func (s *Server) profile(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	id := r.PathValue("id")
	profile, err := one(r.Context(), s.db, `SELECT `+profileExpr("u")+` FROM "User" u WHERE u.id=$1 AND u."emailVerified" AND u.password<>'__pending__'`, id)
	if err != nil {
		return nil, err
	}
	posts, err := many(r.Context(), s.db, `SELECT `+postExpr("p", true)+` FROM "Post" p WHERE p."userId"=$1 AND NOT p.pinned ORDER BY p."createdAt" DESC,p.id DESC LIMIT 100`, id)
	if err != nil {
		return nil, err
	}
	pinned, err := many(r.Context(), s.db, `SELECT `+postExpr("p", true)+` FROM "Post" p WHERE p."userId"=$1 AND p.pinned ORDER BY p."createdAt" DESC LIMIT 1`, id)
	if err != nil {
		return nil, err
	}
	profile["posts"] = posts
	profile["pinnedPost"] = nil
	if len(pinned) > 0 {
		profile["pinnedPost"] = pinned[0]
	}
	return profile, nil
}
func (s *Server) me(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	if r.Method == "DELETE" {
		b, err := decode(r)
		if err != nil {
			return nil, err
		}
		password := str(b, "password")
		if len(password) > 72 {
			password = password[:72]
		}
		if !s.limits.allow("delete-account:"+u.ID, 5, 10*time.Minute) {
			return nil, &apiError{429, "Слишком много попыток"}
		}
		if bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(password)) != nil {
			return nil, denied()
		}
		if err = affected(s.db.ExecContext(r.Context(), `DELETE FROM "User" WHERE id=$1`, u.ID)); err != nil {
			return nil, err
		}
		s.cookie(w, r, sessionCookie, "", "/", -1)
		s.hub.disconnect(u.ID)
		return success(), nil
	}
	if r.Method == "PUT" {
		b, err := decode(r)
		if err != nil {
			return nil, err
		}
		fields := []string{}
		args := []any{}
		for _, key := range []string{"username", "avatar", "header", "bio"} {
			v, present := b[key]
			if !present {
				continue
			}
			if key == "username" {
				name, ok := v.(string)
				if !ok || !usernamePattern.MatchString(name) {
					return nil, bad("Некорректный логин")
				}
			}
			if key == "bio" && v != nil {
				if _, err := textValue(b, key, 500, false); err != nil {
					return nil, err
				}
			}
			if key == "avatar" || key == "header" {
				if v != nil {
					url, ok := v.(string)
					if !ok {
						return nil, bad("Некорректное изображение")
					}
					if url != "/default-avatar.png" && url != "/default-header.png" {
						file, ok := parseUpload(url)
						if !ok || !imageExtension(file) {
							return nil, bad("Некорректное изображение")
						}
						allowed, err := s.canAttach(r.Context(), url, u.ID)
						if err != nil {
							return nil, err
						}
						if !allowed {
							return nil, denied()
						}
					}
				}
			}
			args = append(args, v)
			fields = append(fields, `"`+key+`"=$`+itoa(len(args)))
		}
		if len(fields) > 0 {
			args = append(args, u.ID)
			if err := affected(s.db.ExecContext(r.Context(), `UPDATE "User" SET `+strings.Join(fields, ",")+` WHERE id=$`+itoa(len(args)), args...)); err != nil {
				return nil, err
			}
		}
	}
	value, err := one(r.Context(), s.db, `SELECT `+profileExpr("u")+` || jsonb_build_object('role',u.role,'emailEncrypted',u."emailEncrypted") FROM "User" u WHERE id=$1`, u.ID)
	if err != nil {
		return nil, err
	}
	email, err := decryptText(s.cfg.EncryptionKey, str(value, "emailEncrypted"))
	if err != nil {
		return nil, err
	}
	delete(value, "emailEncrypted")
	value["email"] = email
	return value, nil
}
func (s *Server) lastSeen(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	_, err := s.db.ExecContext(r.Context(), `UPDATE "User" SET "lastSeenAt"=$1 WHERE id=$2`, now(), u.ID)
	return success(), err
}
func (s *Server) follow(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	id := r.PathValue("id")
	if r.Method == "GET" {
		return one(r.Context(), s.db, `SELECT jsonb_build_object('followerCount',(SELECT count(*) FROM follows WHERE "followingId"=$1),'followingCount',(SELECT count(*) FROM follows WHERE "followerId"=$1),'isFollowing',EXISTS(SELECT 1 FROM follows WHERE "followerId"=$2 AND "followingId"=$1))`, id, u.ID)
	}
	if id == u.ID {
		return nil, bad("Нельзя подписаться на себя")
	}
	followed := false
	err := s.transaction(r.Context(), func(q Querier) error {
		var lock string
		if err := q.QueryRowContext(r.Context(), `SELECT id FROM "User" WHERE id=$1 FOR UPDATE`, u.ID).Scan(&lock); err != nil {
			return err
		}
		result, err := q.ExecContext(r.Context(), `DELETE FROM follows WHERE "followerId"=$1 AND "followingId"=$2`, u.ID, id)
		if err != nil {
			return err
		}
		n, _ := result.RowsAffected()
		followed = n == 0
		if followed {
			_, err = q.ExecContext(r.Context(), `INSERT INTO follows(id,"followerId","followingId") VALUES($1,$2,$3)`, newID(), u.ID, id)
		}
		return err
	})
	return M{"followed": followed}, err
}
func escapeLike(s string) string {
	return strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(s)
}
func (s *Server) searchUsers(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(query) > 200 {
		return nil, bad("Слишком длинный запрос")
	}
	items := []M{}
	if query != "" {
		var err error
		items, err = many(r.Context(), s.db, `SELECT `+profileExpr("u")+` FROM "User" u WHERE u."emailVerified" AND u.password<>'__pending__' AND u.username ILIKE $1 AND u.id<>$2 AND ($3='' OR u.id>$3) ORDER BY u.id LIMIT $4`, "%"+escapeLike(query)+"%", u.ID, r.URL.Query().Get("cursor"), integer(r.URL.Query().Get("limit"), 20, 50)+1)
		if err != nil {
			return nil, err
		}
	}
	if r.URL.Path == "/api/messenger/users" {
		limit := integer(r.URL.Query().Get("limit"), 20, 50)
		var next any
		if len(items) > limit {
			items = items[:limit]
			next = items[len(items)-1]["id"]
		}
		return M{"users": items, "nextCursor": next}, nil
	}
	return items, nil
}
func (s *Server) searchPosts(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	tag := strings.ToLower(r.URL.Query().Get("hashtag"))
	if len(query) > 200 || len(tag) > 200 {
		return nil, bad("Слишком длинный запрос")
	}
	if query == "" && tag == "" {
		return M{"posts": []M{}}, nil
	}
	items, err := many(r.Context(), s.db, `SELECT `+postExpr("p", true)+` FROM "Post" p WHERE ($1='' OR p.content ILIKE $2) AND ($3='' OR EXISTS(SELECT 1 FROM post_hashtags ph JOIN "Hashtag" h ON h.id=ph."hashtagId" WHERE ph."postId"=p.id AND h.name=$3)) ORDER BY p."createdAt" DESC,p.id DESC LIMIT 50`, query, "%"+escapeLike(query)+"%", tag)
	return M{"posts": items}, err
}
func (s *Server) trending(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	return many(r.Context(), s.db, `SELECT jsonb_build_object('name',h.name,'hashtag',h.name,'count',count(ph."postId"),'postCount',count(ph."postId")) FROM "Hashtag" h JOIN post_hashtags ph ON ph."hashtagId"=h.id GROUP BY h.id ORDER BY count(ph."postId") DESC,h.name LIMIT 10`)
}
func (s *Server) explore(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	users, err := many(r.Context(), s.db, `SELECT `+profileExpr("u")+` FROM "User" u WHERE u."emailVerified" AND u.password<>'__pending__' ORDER BY (SELECT count(*) FROM "Post" p WHERE p."userId"=u.id) DESC,u.id LIMIT 5`)
	if err != nil {
		return nil, err
	}
	posts, err := many(r.Context(), s.db, `SELECT `+postExpr("p", true)+` FROM "Post" p ORDER BY (SELECT count(*) FROM "Like" l WHERE l."postId"=p.id) DESC,p."createdAt" DESC LIMIT 5`)
	return M{"popularUsers": users, "popularPosts": posts}, err
}
func (s *Server) notifications(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	if r.Method == "PUT" {
		_, err := s.db.ExecContext(r.Context(), `UPDATE "Notification" SET read=true WHERE "userId"=$1 AND NOT read`, u.ID)
		return success(), err
	}
	items, err := many(r.Context(), s.db, `SELECT to_jsonb(n) || jsonb_build_object('actor',(SELECT `+userExpr("a")+` FROM "User" a WHERE a.id=n."actorId"),'post',(SELECT jsonb_build_object('id',p.id,'content',p.content) FROM "Post" p WHERE p.id=n."postId")) FROM "Notification" n WHERE n."userId"=$1 ORDER BY n."createdAt" DESC LIMIT 50`, u.ID)
	if err != nil {
		return nil, err
	}
	var unread int
	err = s.db.QueryRowContext(r.Context(), `SELECT count(*) FROM "Notification" WHERE "userId"=$1 AND NOT read`, u.ID).Scan(&unread)
	return M{"notifications": items, "unreadCount": unread}, err
}
func (s *Server) adminUsers(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	if r.Method == "GET" {
		items, err := many(r.Context(), s.db, `SELECT `+profileExpr("u")+` || jsonb_build_object('role',u.role,'emailEncrypted',u."emailEncrypted") FROM "User" u ORDER BY u."createdAt" DESC LIMIT 1000`)
		if err != nil {
			return nil, err
		}
		for _, item := range items {
			email, err := decryptText(s.cfg.EncryptionKey, str(item, "emailEncrypted"))
			if err != nil {
				return nil, err
			}
			delete(item, "emailEncrypted")
			item["email"] = email
		}
		return items, nil
	}
	id := r.PathValue("id")
	if r.Method == "DELETE" {
		if id == u.ID {
			return nil, bad("Нельзя удалить текущего администратора здесь")
		}
		err := affected(s.db.ExecContext(r.Context(), `DELETE FROM "User" WHERE id=$1`, id))
		if err == nil {
			s.hub.disconnect(id)
		}
		return success(), err
	}
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	name, hasName := b["username"]
	role, hasRole := b["role"]
	if hasName {
		v, ok := name.(string)
		if !ok || !usernamePattern.MatchString(v) {
			return nil, bad("Некорректный логин")
		}
	}
	if hasRole && role != "user" && role != "admin" {
		return nil, bad("Некорректная роль")
	}
	if id == u.ID && hasRole && role != "admin" {
		return nil, bad("Нельзя снять свою роль администратора")
	}
	err = affected(s.db.ExecContext(r.Context(), `UPDATE "User" SET username=CASE WHEN $1 THEN $2 ELSE username END,role=CASE WHEN $3 THEN $4 ELSE role END WHERE id=$5`, hasName, name, hasRole, role, id))
	return success(), err
}
func (s *Server) adminPosts(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	if r.Method == "PUT" {
		b, err := decode(r)
		if err != nil {
			return nil, err
		}
		content, err := textValue(b, "content", 1000, true)
		if err != nil {
			return nil, err
		}
		id := r.PathValue("id")
		err = s.transaction(r.Context(), func(q Querier) error {
			if err := affected(q.ExecContext(r.Context(), `UPDATE "Post" SET content=$1,"updatedAt"=now() WHERE id=$2`, content, id)); err != nil {
				return err
			}
			return setHashtags(r.Context(), q, id, content)
		})
		if err != nil {
			return nil, err
		}
		return s.getPost(r.Context(), s.db, id)
	}

	if r.Method == "DELETE" {
		return success(), affected(s.db.ExecContext(r.Context(), `DELETE FROM "Post" WHERE id=$1`, r.PathValue("id")))
	}
	return many(r.Context(), s.db, `SELECT `+postExpr("p", true)+` FROM "Post" p ORDER BY p."createdAt" DESC LIMIT 1000`)
}
func (s *Server) releaseNotes(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	id := r.PathValue("id")
	if r.Method == "GET" {
		return many(r.Context(), s.db, `SELECT to_jsonb(n) FROM "ReleaseNote" n ORDER BY n."createdAt" DESC LIMIT 100`)
	}
	if r.Method == "DELETE" {
		return success(), affected(s.db.ExecContext(r.Context(), `DELETE FROM "ReleaseNote" WHERE id=$1`, id))
	}
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	title, err := textValue(b, "title", 200, true)
	if err != nil {
		return nil, err
	}
	content, err := textValue(b, "content", 100000, true)
	if err != nil {
		return nil, err
	}
	if r.Method == "POST" {
		return one(r.Context(), s.db, `INSERT INTO "ReleaseNote"(id,title,content,"updatedAt") VALUES($1,$2,$3,$4) RETURNING to_jsonb("ReleaseNote")`, newID(), title, content, now())
	}
	return one(r.Context(), s.db, `UPDATE "ReleaseNote" SET title=$1,content=$2,"updatedAt"=$3 WHERE id=$4 RETURNING to_jsonb("ReleaseNote")`, title, content, now(), id)
}
func (s *Server) clearMessenger(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	_, err := s.db.ExecContext(r.Context(), `DELETE FROM "Conversation"`)
	return success(), err
}

// Operator-only CLI action; this is deliberately not an HTTP endpoint.
func (s *Server) PromoteAdmin(ctx context.Context, username string) error {
	if !usernamePattern.MatchString(username) {
		return bad("Некорректный логин")
	}
	return affected(s.db.ExecContext(ctx, `UPDATE "User" SET role='admin' WHERE username=$1 AND "emailVerified" AND password<>'__pending__'`, username))
}
