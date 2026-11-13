package server

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

func userExpr(alias string) string {
	return `jsonb_build_object('id',` + alias + `.id,'username',` + alias + `.username,'avatar',` + alias + `.avatar)`
}
func postExpr(a string, related bool) string {
	base := `to_jsonb(` + a + `) || jsonb_build_object('user',(SELECT ` + userExpr("pu") + ` FROM "User" pu WHERE pu.id=` + a + `."userId"),'likes',COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',l."userId")) FROM "Like" l WHERE l."postId"=` + a + `.id),'[]'::jsonb),'_count',jsonb_build_object('likes',(SELECT count(*) FROM "Like" l WHERE l."postId"=` + a + `.id),'comments',(SELECT count(*) FROM "Comment" c WHERE c."postId"=` + a + `.id),'reposts',(SELECT count(*) FROM "Post" rp WHERE rp.repost_of_id=` + a + `.id)))`
	if related {
		base += ` || jsonb_build_object('repostOf',(SELECT ` + postExpr("rp", false) + ` FROM "Post" rp WHERE rp.id=` + a + `.repost_of_id),'repostedComment',(SELECT ` + commentExpr("rc", false) + ` || jsonb_build_object('post',(SELECT ` + postExpr("cp", false) + ` FROM "Post" cp WHERE cp.id=rc."postId")) FROM "Comment" rc WHERE rc.id=` + a + `."reposted_comment_id"),'poll',(SELECT ` + pollExpr("po") + ` FROM "Poll" po WHERE po."postId"=` + a + `.id))`
	}
	return "(" + base + ")"
}
func commentExpr(a string, replies bool) string {
	base := `to_jsonb(` + a + `) || jsonb_build_object('user',(SELECT ` + userExpr("cu") + ` FROM "User" cu WHERE cu.id=` + a + `."userId"),'likes',COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',cl."userId")) FROM comment_likes cl WHERE cl."commentId"=` + a + `.id),'[]'::jsonb),'_count',jsonb_build_object('likes',(SELECT count(*) FROM comment_likes cl WHERE cl."commentId"=` + a + `.id)))`
	if replies {
		base += ` || jsonb_build_object('replies',COALESCE((SELECT jsonb_agg(` + commentExpr("cr", false) + ` ORDER BY cr."createdAt",cr.id) FROM "Comment" cr WHERE cr."parentId"=` + a + `.id),'[]'::jsonb))`
	}
	return "(" + base + ")"
}
func pollExpr(a string) string {
	return `(to_jsonb(` + a + `) || jsonb_build_object('options',COALESCE((SELECT jsonb_agg(to_jsonb(o) || jsonb_build_object('_count',jsonb_build_object('votes',(SELECT count(*) FROM "Vote" v WHERE v."optionId"=o.id)),'votes',COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',v."userId")) FROM "Vote" v WHERE v."optionId"=o.id),'[]'::jsonb)) ORDER BY o.position,o.id) FROM "PollOption" o WHERE o."pollId"=` + a + `.id),'[]'::jsonb)))`
}
func textValue(b M, key string, max int, required bool) (string, error) {
	v, present := b[key]
	if !present && !required {
		return "", nil
	}
	s, ok := v.(string)
	if !ok || utf8.RuneCountInString(s) > max || (required && strings.TrimSpace(s) == "") {
		return "", bad("Некорректное поле " + key)
	}
	return strings.TrimSpace(s), nil
}
func (s *Server) getPost(ctx context.Context, q Querier, id string) (M, error) {
	return one(ctx, q, `SELECT `+postExpr("p", true)+` FROM "Post" p WHERE p.id=$1`, id)
}
func (s *Server) posts(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	page := integer(r.URL.Query().Get("page"), 1, 100000)
	limit := integer(r.URL.Query().Get("limit"), 10, 50)
	where := "true"
	order := `p."createdAt" DESC,p.id DESC`
	args := []any{u.ID, limit, (page - 1) * limit}
	switch r.URL.Path {
	case "/api/feed/following":
		where = `EXISTS(SELECT 1 FROM follows f WHERE f."followerId"=$1 AND f."followingId"=p."userId")`
	case "/api/feed/for-you":
		order = `(((SELECT count(*) FROM "Like" l WHERE l."postId"=p.id)*2+(SELECT count(*) FROM "Comment" c WHERE c."postId"=p.id)*3+(SELECT count(*) FROM "Post" rp WHERE rp.repost_of_id=p.id)*1.5)*10+GREATEST(0,1-EXTRACT(EPOCH FROM (now()-p."createdAt"))/604800)*50)*(CASE WHEN EXISTS(SELECT 1 FROM follows f WHERE f."followerId"=$1 AND f."followingId"=p."userId") THEN 2 ELSE 1 END) DESC,p."createdAt" DESC,p.id DESC`
	case "/api/bookmarks":
		where = `EXISTS(SELECT 1 FROM bookmarks b WHERE b."postId"=p.id AND b."userId"=$1)`
	}
	// $1 is used even for the unfiltered feed, keeping all query parameter types explicit.
	where = `($1::text IS NOT NULL) AND (` + where + `)`
	items, err := many(r.Context(), s.db, `SELECT `+postExpr("p", true)+` FROM "Post" p WHERE `+where+` ORDER BY `+order+` LIMIT $2 OFFSET $3`, args...)
	if err != nil {
		return nil, err
	}
	if r.URL.Path == "/api/bookmarks" {
		return items, nil
	}
	var total int
	err = s.db.QueryRowContext(r.Context(), `SELECT count(*) FROM "Post" p WHERE `+where, u.ID).Scan(&total)
	return M{"posts": items, "total": total, "page": page, "limit": limit}, err
}

var hashtagPattern = regexp.MustCompile(`#[\pL\pN_]+`)

func (s *Server) createPost(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	content, err := textValue(b, "content", 1000, false)
	if err != nil {
		return nil, err
	}
	media := str(b, "mediaUrl")
	kind := str(b, "mediaType")
	if content == "" && media == "" {
		return nil, bad("Пост не может быть пустым")
	}
	if media != "" {
		if kind != "image" && kind != "video" && kind != "circle" {
			return nil, bad("Некорректный тип вложения")
		}
		allowed, err := s.canAttach(r.Context(), media, u.ID)
		if err != nil {
			return nil, err
		}
		if !allowed {
			return nil, denied()
		}
	}
	id := newID()
	err = s.transaction(r.Context(), func(q Querier) error {
		_, err := q.ExecContext(r.Context(), `INSERT INTO "Post"(id,"userId",content,"mediaUrl","mediaType","updatedAt") VALUES($1,$2,$3,$4,$5,$6)`, id, u.ID, content, nullable(media), nullable(kind), now())
		if err != nil {
			return err
		}
		return setHashtags(r.Context(), q, id, content)
	})
	if err != nil {
		return nil, err
	}
	return s.getPost(r.Context(), s.db, id)
}
func setHashtags(ctx context.Context, q Querier, id, content string) error {
	if _, err := q.ExecContext(ctx, `DELETE FROM post_hashtags WHERE "postId"=$1`, id); err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, tag := range hashtagPattern.FindAllString(content, -1) {
		tag = strings.ToLower(tag)
		if seen[tag] {
			continue
		}
		seen[tag] = true
		var tagID string
		if err := q.QueryRowContext(ctx, `INSERT INTO "Hashtag"(id,name) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET name=excluded.name RETURNING id`, newID(), tag).Scan(&tagID); err != nil {
			return err
		}
		if _, err := q.ExecContext(ctx, `INSERT INTO post_hashtags("postId","hashtagId") VALUES($1,$2)`, id, tagID); err != nil {
			return err
		}
	}
	return nil
}
func (s *Server) post(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	id := r.PathValue("id")
	if r.Method == "GET" {
		return s.getPost(r.Context(), s.db, id)
	}
	if r.Method == "POST" {
		return s.repost(w, r, u)
	}
	if r.Method == "DELETE" {
		return success(), affected(s.db.ExecContext(r.Context(), `DELETE FROM "Post" WHERE id=$1 AND ("userId"=$2 OR $3='admin')`, id, u.ID, u.Role))
	}
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	content, err := textValue(b, "content", 1000, true)
	if err != nil {
		return nil, err
	}
	err = s.transaction(r.Context(), func(q Querier) error {
		err := affected(q.ExecContext(r.Context(), `UPDATE "Post" SET content=$1,"updatedAt"=$2 WHERE id=$3 AND "userId"=$4 AND "createdAt">now()-interval '10 minutes'`, content, now(), id, u.ID))
		if err != nil {
			return err
		}
		return setHashtags(r.Context(), q, id, content)
	})
	if err != nil {
		return nil, err
	}
	return s.getPost(r.Context(), s.db, id)
}
func notify(ctx context.Context, q Querier, user, actor, kind, post, comment, like string) error {
	if user == actor {
		return nil
	}
	_, err := q.ExecContext(ctx, `INSERT INTO "Notification"(id,"userId",type,"actorId","postId","commentId","likeId") VALUES($1,$2,$3,$4,$5,$6,$7)`, newID(), user, kind, actor, nullable(post), nullable(comment), nullable(like))
	return err
}
func (s *Server) repost(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	content, err := textValue(b, "content", 1000, false)
	if err != nil {
		return nil, err
	}
	id := newID()
	original := r.PathValue("id")
	var author string
	var postID string
	comment := ""
	column := "repost_of_id"
	if strings.Contains(r.URL.Path, "/comments/") {
		comment = original
		column = "reposted_comment_id"
		err = s.db.QueryRowContext(r.Context(), `SELECT "userId","postId" FROM "Comment" WHERE id=$1`, original).Scan(&author, &postID)
	} else {
		postID = original
		err = s.db.QueryRowContext(r.Context(), `SELECT "userId" FROM "Post" WHERE id=$1`, original).Scan(&author)
	}
	if err != nil {
		return nil, err
	}
	err = s.transaction(r.Context(), func(q Querier) error {
		if _, err := q.ExecContext(r.Context(), `INSERT INTO "Post"(id,"userId",content,"updatedAt",`+column+`) VALUES($1,$2,$3,$4,$5)`, id, u.ID, content, now(), original); err != nil {
			return err
		}
		if err := setHashtags(r.Context(), q, id, content); err != nil {
			return err
		}
		return notify(r.Context(), q, author, u.ID, "repost", postID, comment, "")
	})
	if err != nil {
		return nil, err
	}
	return s.getPost(r.Context(), s.db, id)
}
func (s *Server) postLike(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	id := r.PathValue("id")
	liked := false
	count := 0
	err := s.transaction(r.Context(), func(q Querier) error {
		var author string
		if err := q.QueryRowContext(r.Context(), `SELECT "userId" FROM "Post" WHERE id=$1 FOR UPDATE`, id).Scan(&author); err != nil {
			return err
		}
		var existing string
		err := q.QueryRowContext(r.Context(), `SELECT id FROM "Like" WHERE "userId"=$1 AND "postId"=$2`, u.ID, id).Scan(&existing)
		if err == nil {
			_, err = q.ExecContext(r.Context(), `DELETE FROM "Like" WHERE id=$1`, existing)
			liked = false
		} else if errors.Is(err, sql.ErrNoRows) {
			likeID := newID()
			_, err = q.ExecContext(r.Context(), `INSERT INTO "Like"(id,"userId","postId") VALUES($1,$2,$3)`, likeID, u.ID, id)
			if err == nil {
				err = notify(r.Context(), q, author, u.ID, "like", id, "", likeID)
			}
			liked = true
		}
		if err != nil {
			return err
		}
		return q.QueryRowContext(r.Context(), `SELECT count(*) FROM "Like" WHERE "postId"=$1`, id).Scan(&count)
	})
	return M{"liked": liked, "_count": M{"likes": count}}, err
}
func (s *Server) bookmark(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	id := str(b, "postId")
	bookmarked := false
	err = s.transaction(r.Context(), func(q Querier) error {
		var lock string
		if err := q.QueryRowContext(r.Context(), `SELECT id FROM "User" WHERE id=$1 FOR UPDATE`, u.ID).Scan(&lock); err != nil {
			return err
		}
		var existing string
		err := q.QueryRowContext(r.Context(), `SELECT id FROM bookmarks WHERE "userId"=$1 AND "postId"=$2`, u.ID, id).Scan(&existing)
		if err == nil {
			_, err = q.ExecContext(r.Context(), `DELETE FROM bookmarks WHERE id=$1`, existing)
			bookmarked = false
			return err
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		_, err = q.ExecContext(r.Context(), `INSERT INTO bookmarks(id,"userId","postId") VALUES($1,$2,$3)`, newID(), u.ID, id)
		bookmarked = true
		return err
	})
	return M{"bookmarked": bookmarked}, err
}
func (s *Server) pinPost(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	id := r.PathValue("id")
	pinned := false
	err := s.transaction(r.Context(), func(q Querier) error {
		var previous bool
		if err := q.QueryRowContext(r.Context(), `SELECT pinned FROM "Post" WHERE id=$1 AND "userId"=$2 FOR UPDATE`, id, u.ID).Scan(&previous); err != nil {
			return err
		}
		if _, err := q.ExecContext(r.Context(), `UPDATE "Post" SET pinned=false WHERE "userId"=$1`, u.ID); err != nil {
			return err
		}
		pinned = !previous
		_, err := q.ExecContext(r.Context(), `UPDATE "Post" SET pinned=$1 WHERE id=$2`, pinned, id)
		return err
	})
	return M{"pinned": pinned}, err
}
func (s *Server) viewPost(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	id := r.PathValue("id")
	var count int
	var err error
	if s.limits.allow("view:"+u.ID+":"+id, 1, 24*time.Hour) {
		err = s.db.QueryRowContext(r.Context(), `UPDATE "Post" SET views=views+1 WHERE id=$1 RETURNING views`, id).Scan(&count)
	} else {
		err = s.db.QueryRowContext(r.Context(), `SELECT views FROM "Post" WHERE id=$1`, id).Scan(&count)
	}
	return M{"views": count}, err
}
func (s *Server) comments(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	id := r.PathValue("id")
	if r.Method == "GET" {
		return many(r.Context(), s.db, `SELECT `+commentExpr("c", true)+` FROM "Comment" c WHERE c."postId"=$1 AND c."parentId" IS NULL ORDER BY c."createdAt" DESC,c.id DESC LIMIT 200`, id)
	}
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	content, err := textValue(b, "content", 1000, true)
	if err != nil {
		return nil, err
	}
	parent := str(b, "parentId")
	if parent != "" {
		var root sql.NullString
		err = s.db.QueryRowContext(r.Context(), `SELECT "parentId" FROM "Comment" WHERE id=$1 AND "postId"=$2`, parent, id).Scan(&root)
		if err != nil {
			return nil, bad("Комментарий для ответа недоступен")
		}
		if root.Valid {
			parent = root.String
		}
	}
	comment := newID()
	err = s.transaction(r.Context(), func(q Querier) error {
		var author string
		if err := q.QueryRowContext(r.Context(), `SELECT "userId" FROM "Post" WHERE id=$1`, id).Scan(&author); err != nil {
			return err
		}
		if _, err := q.ExecContext(r.Context(), `INSERT INTO "Comment"(id,"userId","postId",content,"parentId") VALUES($1,$2,$3,$4,$5)`, comment, u.ID, id, content, nullable(parent)); err != nil {
			return err
		}
		return notify(r.Context(), q, author, u.ID, "comment", id, comment, "")
	})
	if err != nil {
		return nil, err
	}
	return one(r.Context(), s.db, `SELECT `+commentExpr("c", true)+` FROM "Comment" c WHERE c.id=$1`, comment)
}
func (s *Server) commentLike(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	id := r.PathValue("id")
	liked := false
	count := 0
	err := s.transaction(r.Context(), func(q Querier) error {
		var lock string
		if err := q.QueryRowContext(r.Context(), `SELECT id FROM "Comment" WHERE id=$1 FOR UPDATE`, id).Scan(&lock); err != nil {
			return err
		}
		result, err := q.ExecContext(r.Context(), `DELETE FROM comment_likes WHERE "userId"=$1 AND "commentId"=$2`, u.ID, id)
		if err != nil {
			return err
		}
		n, _ := result.RowsAffected()
		liked = n == 0
		if liked {
			if _, err = q.ExecContext(r.Context(), `INSERT INTO comment_likes(id,"userId","commentId") VALUES($1,$2,$3)`, newID(), u.ID, id); err != nil {
				return err
			}
		}
		return q.QueryRowContext(r.Context(), `SELECT count(*) FROM comment_likes WHERE "commentId"=$1`, id).Scan(&count)
	})
	return M{"liked": liked, "_count": M{"likes": count}}, err
}
