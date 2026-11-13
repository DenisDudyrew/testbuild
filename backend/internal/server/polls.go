package server

import (
	"database/sql"
	"errors"
	"net/http"
	"time"
)

func (s *Server) poll(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	question, err := textValue(b, "question", 300, true)
	if err != nil {
		return nil, err
	}
	options, ok := arrayStrings(b["options"])
	if !ok || len(options) < 2 || len(options) > 10 {
		return nil, bad("Нужно от 2 до 10 вариантов")
	}
	for _, option := range options {
		if len(option) > 300 {
			return nil, bad("Слишком длинный вариант")
		}
	}
	post := str(b, "postId")
	allowed, err := exists(r.Context(), s.db, `SELECT 1 FROM "Post" WHERE id=$1 AND "userId"=$2`, post, u.ID)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, denied()
	}
	var expires any
	if hours := number(b["expiresInHours"]); hours > 0 && hours <= 24*365 {
		expires = now().Add(time.Duration(hours) * time.Hour)
	}
	id := newID()
	err = s.transaction(r.Context(), func(q Querier) error {
		if _, err := q.ExecContext(r.Context(), `INSERT INTO "Poll"(id,"postId",question,"expiresAt") VALUES($1,$2,$3,$4)`, id, post, question, expires); err != nil {
			return err
		}
		for position, text := range options {
			if _, err := q.ExecContext(r.Context(), `INSERT INTO "PollOption"(id,"pollId",text,position) VALUES($1,$2,$3,$4)`, newID(), id, text, position); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return one(r.Context(), s.db, `SELECT `+pollExpr("po")+` FROM "Poll" po WHERE id=$1`, id)
}
func (s *Server) vote(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	if r.Method == "GET" {
		poll, err := one(r.Context(), s.db, `SELECT `+pollExpr("po")+` FROM "Poll" po WHERE id=$1`, r.URL.Query().Get("pollId"))
		if err != nil {
			return nil, err
		}
		poll["votedOptionId"] = nil
		if options, ok := poll["options"].([]any); ok {
			for _, v := range options {
				option, _ := v.(map[string]any)
				votes, _ := option["votes"].([]any)
				for _, v := range votes {
					vote, _ := v.(map[string]any)
					if vote["userId"] == u.ID {
						poll["votedOptionId"] = option["id"]
						option["voted"] = true
					}
				}
			}
		}
		return poll, nil
	}
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	pollID, option := str(b, "pollId"), str(b, "optionId")
	voted := false
	err = s.transaction(r.Context(), func(q Querier) error {
		var expiry sql.NullTime
		if err := q.QueryRowContext(r.Context(), `SELECT p."expiresAt" FROM "Poll" p JOIN "PollOption" o ON o."pollId"=p.id WHERE p.id=$1 AND o.id=$2 FOR UPDATE OF p`, pollID, option).Scan(&expiry); err != nil {
			return err
		}
		if expiry.Valid && expiry.Time.Before(now()) {
			return bad("Опрос завершён")
		}
		var previous string
		err := q.QueryRowContext(r.Context(), `SELECT v."optionId" FROM "Vote" v JOIN "PollOption" o ON o.id=v."optionId" WHERE o."pollId"=$1 AND v."userId"=$2`, pollID, u.ID).Scan(&previous)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if _, err = q.ExecContext(r.Context(), `DELETE FROM "Vote" WHERE "userId"=$1 AND "optionId" IN(SELECT id FROM "PollOption" WHERE "pollId"=$2)`, u.ID, pollID); err != nil {
			return err
		}
		voted = previous != option
		if voted {
			_, err = q.ExecContext(r.Context(), `INSERT INTO "Vote"(id,"optionId","userId") VALUES($1,$2,$3)`, newID(), option, u.ID)
		}
		return err
	})
	var chosen any
	if voted {
		chosen = option
	}
	return M{"voted": voted, "optionId": chosen}, err
}
