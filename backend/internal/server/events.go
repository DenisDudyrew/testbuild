package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

type Event struct {
	kind string
	data M
}
type subscriber struct {
	events chan Event
	done   chan struct{}
}
type Hub struct {
	sync.Mutex
	users map[string]map[*subscriber]bool
}

func newHub() *Hub { return &Hub{users: map[string]map[*subscriber]bool{}} }
func (h *Hub) subscribe(user string) (*subscriber, bool) {
	h.Lock()
	defer h.Unlock()
	if len(h.users[user]) >= 8 || len(h.users) >= 2000 {
		return nil, false
	}
	client := &subscriber{events: make(chan Event, 64), done: make(chan struct{})}
	if h.users[user] == nil {
		h.users[user] = map[*subscriber]bool{}
	}
	h.users[user][client] = true
	return client, true
}
func (h *Hub) remove(user string, c *subscriber) {
	h.Lock()
	defer h.Unlock()
	if h.users[user][c] {
		delete(h.users[user], c)
		close(c.done)
		if len(h.users[user]) == 0 {
			delete(h.users, user)
		}
	}
}
func (h *Hub) publish(user, kind string, data M) {
	h.Lock()
	defer h.Unlock()
	for c := range h.users[user] {
		select {
		case c.events <- Event{kind, data}:
		default:
			delete(h.users[user], c)
			close(c.done)
		}
	}
	if len(h.users[user]) == 0 {
		delete(h.users, user)
	}
}
func (h *Hub) disconnect(user string) {
	h.Lock()
	defer h.Unlock()
	for c := range h.users[user] {
		close(c.done)
	}
	delete(h.users, user)
}
func (s *Server) publish(cid, kind string, data M) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	rows, err := s.db.QueryContext(ctx, `SELECT "userId" FROM "ConversationParticipant" WHERE "conversationId"=$1`, cid)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var user string
		if rows.Scan(&user) != nil {
			return
		}
		s.hub.publish(user, kind, data)
		if kind != "conversation:update" && kind != "typing:update" {
			s.hub.publish(user, "conversation:update", M{"conversationId": cid})
		}
	}
}
func (s *Server) events(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	client, ok := s.hub.subscribe(u.ID)
	if !ok {
		return nil, &apiError{429, "Слишком много открытых подключений"}
	}
	defer s.hub.remove(u.ID, client)
	controller := http.NewResponseController(w)
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("Vary", "Cookie")
	_, _ = fmt.Fprint(w, "retry: 2000\n\n")
	if err := controller.Flush(); err != nil {
		return nil, nil
	}
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-r.Context().Done():
			return nil, nil
		case <-client.done:
			return nil, nil
		case <-ticker.C:
			if _, err := s.authenticate(r); err != nil {
				return nil, nil
			}
			_ = controller.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if _, err := fmt.Fprint(w, ": heartbeat\n\n"); err != nil {
				return nil, nil
			}
			if controller.Flush() != nil {
				return nil, nil
			}
		case event := <-client.events:
			cid := str(event.data, "conversationId")
			if cid != "" {
				if member(r.Context(), s.db, cid, u.ID) != nil {
					continue
				}
			}
			if event.kind == "message:new" {
				visible, err := exists(r.Context(), s.db, `SELECT 1 FROM "Message" m WHERE m.id=$1 AND `+visibleMessage("m", 2), str(event.data, "id"), u.ID)
				if err != nil || !visible {
					continue
				}
			}
			data, err := json.Marshal(event.data)
			if err != nil {
				continue
			}
			_ = controller.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if _, err = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.kind, data); err != nil {
				return nil, nil
			}
			if controller.Flush() != nil {
				return nil, nil
			}
		}
	}
}
