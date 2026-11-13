package server

import (
	"context"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"
)

type endpoint func(http.ResponseWriter, *http.Request, User) (any, error)
type route struct {
	pattern string
	access  string
	status  int
	handler endpoint
}

func (s *Server) routes() []route {
	return []route{
		{"GET /api/health", "public", 200, s.health},
		{"GET /api/auth/session", "public", 200, s.session}, {"POST /api/auth/login", "public", 200, s.login}, {"POST /api/login", "public", 200, s.login}, {"POST /api/auth/logout", "public", 200, s.logout},
		{"POST /api/auth/send-verification", "public", 200, s.sendVerification}, {"POST /api/auth/confirm-email", "public", 200, s.confirmEmail}, {"POST /api/register", "public", 201, s.register},
		{"GET /api/events", "user", 200, s.events},
		{"GET /api/users/me", "user", 200, s.me}, {"PUT /api/users/me", "user", 200, s.me}, {"DELETE /api/users/me", "user", 200, s.me}, {"PUT /api/users/me/password", "user", 200, s.changePassword}, {"POST /api/users/me/last-seen", "user", 200, s.lastSeen},
		{"GET /api/users/search", "user", 200, s.searchUsers}, {"GET /api/users/{id}", "user", 200, s.profile}, {"GET /api/users/{id}/follow", "user", 200, s.follow}, {"POST /api/users/{id}/follow", "user", 200, s.follow},
		{"GET /api/posts", "user", 200, s.posts}, {"POST /api/posts", "user", 201, s.createPost}, {"GET /api/posts/search", "user", 200, s.searchPosts},
		{"GET /api/posts/{id}", "user", 200, s.post}, {"POST /api/posts/{id}", "user", 201, s.post}, {"DELETE /api/posts/{id}", "user", 200, s.post}, {"PUT /api/posts/{id}/edit", "user", 200, s.post},
		{"POST /api/posts/{id}/like", "user", 200, s.postLike}, {"POST /api/posts/{id}/pin", "user", 200, s.pinPost}, {"POST /api/posts/{id}/view", "user", 200, s.viewPost},
		{"GET /api/posts/{id}/comments", "user", 200, s.comments}, {"POST /api/posts/{id}/comments", "user", 201, s.comments},
		{"POST /api/comments/{id}/like", "user", 200, s.commentLike}, {"POST /api/comments/{id}/repost", "user", 201, s.repost},
		{"GET /api/feed/for-you", "user", 200, s.posts}, {"GET /api/feed/following", "user", 200, s.posts},
		{"GET /api/bookmarks", "user", 200, s.posts}, {"POST /api/bookmarks", "user", 200, s.bookmark}, {"GET /api/explore", "user", 200, s.explore}, {"GET /api/hashtags/trending", "user", 200, s.trending},
		{"GET /api/notifications", "user", 200, s.notifications}, {"PUT /api/notifications/read", "user", 200, s.notifications},
		{"POST /api/polls", "user", 201, s.poll}, {"POST /api/polls/vote", "user", 200, s.vote}, {"GET /api/polls/vote", "user", 200, s.vote},
		{"POST /api/upload", "user", 201, s.upload}, {"GET /api/files/{filename}", "user", 200, s.file}, {"GET /uploads/{filename}", "user", 200, s.file},
		{"GET /api/messenger/users", "user", 200, s.searchUsers}, {"GET /api/messenger/unread", "user", 200, s.unread},
		{"GET /api/messenger/block", "user", 200, s.block}, {"POST /api/messenger/block", "user", 201, s.block}, {"DELETE /api/messenger/block", "user", 200, s.block},
		{"GET /api/messenger/conversations", "user", 200, s.conversations}, {"POST /api/messenger/conversations", "user", 201, s.conversations},
		{"GET /api/messenger/conversations/{id}", "user", 200, s.conversation}, {"PATCH /api/messenger/conversations/{id}", "user", 200, s.conversation}, {"DELETE /api/messenger/conversations/{id}", "user", 200, s.conversation},
		{"GET /api/messenger/conversations/{id}/messages", "user", 200, s.messages}, {"POST /api/messenger/conversations/{id}/messages", "user", 201, s.messages},
		{"GET /api/messenger/conversations/{id}/search", "user", 200, s.messageSearch}, {"GET /api/messenger/conversations/{id}/media", "user", 200, s.media},
		{"GET /api/messenger/conversations/{id}/typing", "user", 200, s.typing}, {"POST /api/messenger/conversations/{id}/typing", "user", 200, s.typing}, {"DELETE /api/messenger/conversations/{id}/typing", "user", 200, s.typing},
		{"GET /api/messenger/conversations/{id}/pinned", "user", 200, s.pinMessage}, {"POST /api/messenger/conversations/{id}/pin", "user", 200, s.pinMessage},
		{"GET /api/messenger/messages/{messageId}", "user", 200, s.message}, {"PATCH /api/messenger/messages/{messageId}", "user", 200, s.message}, {"DELETE /api/messenger/messages/{messageId}", "user", 200, s.message},
		{"POST /api/messenger/messages/{messageId}/reactions", "user", 200, s.reaction},
		{"GET /api/release-notes", "user", 200, s.releaseNotes},
		{"GET /api/admin/users", "admin", 200, s.adminUsers}, {"PUT /api/admin/users/{id}", "admin", 200, s.adminUsers}, {"DELETE /api/admin/users/{id}", "admin", 200, s.adminUsers},
		{"GET /api/admin/posts", "admin", 200, s.adminPosts}, {"PUT /api/admin/posts/{id}", "admin", 200, s.adminPosts}, {"DELETE /api/admin/posts/{id}", "admin", 200, s.adminPosts},
		{"GET /api/admin/release-notes", "admin", 200, s.releaseNotes}, {"POST /api/admin/release-notes", "admin", 201, s.releaseNotes}, {"PUT /api/admin/release-notes/{id}", "admin", 200, s.releaseNotes}, {"DELETE /api/admin/release-notes/{id}", "admin", 200, s.releaseNotes},
		{"POST /api/admin/messenger/clear", "admin", 200, s.clearMessenger},
	}
}
func (s *Server) wrap(rt route) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recover() != nil {
				writeError(w, &apiError{500, "Внутренняя ошибка"})
			}
		}()
		var user User
		var err error
		if rt.access != "public" {
			user, err = s.authenticate(r)
			if err != nil {
				writeError(w, err)
				return
			}
			if rt.access == "admin" && user.Role != "admin" {
				writeError(w, denied())
				return
			}
		}
		value, err := rt.handler(w, r, user)
		if err != nil {
			writeError(w, err)
			return
		}
		if value != nil {
			writeJSON(w, rt.status, value)
		}
	}
}
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	for _, rt := range s.routes() {
		mux.HandleFunc(rt.pattern, s.wrap(rt))
	}
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { writeError(w, missing()) })
	target, _ := url.Parse(s.cfg.UIOrigin)
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		writeJSON(w, 502, M{"error": "Интерфейс ещё запускается"})
	}
	mux.Handle("/", proxy)
	fileHandler := s.wrap(route{"", "user", 200, s.file})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Request-ID", newID())
		w.Header().Set("Referrer-Policy", "same-origin")
		if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" && !sameOrigin(r, s.cfg.PublicURL) {
			writeError(w, denied())
			return
		}
		decoded := r.URL.Path
		for i := 0; i < 3; i++ {
			v, err := url.PathUnescape(decoded)
			if err != nil {
				writeError(w, bad("Некорректный URL"))
				return
			}
			if v == decoded {
				break
			}
			decoded = v
		}
		if strings.HasPrefix(decoded, "/uploads/") || strings.HasPrefix(decoded, "/api/files/") {
			if r.Method != "GET" && r.Method != "HEAD" {
				writeError(w, &apiError{405, "Метод не поддерживается"})
				return
			}
			prefix := "/uploads/"
			if strings.HasPrefix(decoded, "/api/files/") {
				prefix = "/api/files/"
			}
			r.SetPathValue("filename", strings.TrimPrefix(decoded, prefix))
			fileHandler(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/") {
			if r.URL.Path != "/api/events" {
				ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
				defer cancel()
				r = r.WithContext(ctx)
			}
			if r.URL.Path != "/api/upload" {
				r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
			}
		}
		mux.ServeHTTP(w, r)
	})
}
func (s *Server) health(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if s.db.PingContext(ctx) != nil {
		return nil, &apiError{503, "База недоступна"}
	}
	return M{"status": "ok"}, nil
}
func (s *Server) Close() {
	s.hub.Lock()
	defer s.hub.Unlock()
	for _, clients := range s.hub.users {
		for c := range clients {
			close(c.done)
		}
	}
	s.hub.users = map[string]map[*subscriber]bool{}
}
