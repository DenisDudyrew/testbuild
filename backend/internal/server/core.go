package server

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib"
)

type M = map[string]any
type Querier interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}
type Config struct {
	DatabaseURL, AuthSecret, EncryptionKey, UploadDir, LegacyUploadDir, Address, UIOrigin, PublicURL string
	SMTPHost, SMTPPort, SMTPUser, SMTPPass, SMTPFrom, SMTPFromName                                   string
	SMTPTLS                                                                                          bool
}

func ConfigFromEnv() Config {
	env := func(k, d string) string {
		if v := os.Getenv(k); v != "" {
			return v
		}
		return d
	}
	return Config{DatabaseURL: env("DATABASE_URL", ""), AuthSecret: env("AUTH_SECRET", ""), EncryptionKey: env("ENCRYPTION_KEY", ""), UploadDir: env("UPLOAD_DIR", "./uploads"), LegacyUploadDir: env("LEGACY_UPLOAD_DIR", "./public/uploads"), Address: env("API_ADDR", ":3000"), UIOrigin: env("UI_ORIGIN", "http://127.0.0.1:3001"), PublicURL: env("AUTH_URL", env("NEXTAUTH_URL", "")), SMTPHost: env("SMTP_HOST", ""), SMTPPort: env("SMTP_PORT", "587"), SMTPUser: env("SMTP_USER", ""), SMTPPass: env("SMTP_PASS", ""), SMTPFrom: env("SMTP_FROM", env("SMTP_USER", "")), SMTPFromName: env("SMTP_FROM_NAME", "ZEPHYR"), SMTPTLS: env("SMTP_TLS", "false") == "true"}
}
func OpenDatabase(ctx context.Context, c Config) (*sql.DB, error) {
	db, err := sql.Open("pgx", c.DatabaseURL)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(12)
	db.SetMaxIdleConns(4)
	db.SetConnMaxLifetime(30 * time.Minute)
	if err = db.PingContext(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

type Server struct {
	db       *sql.DB
	cfg      Config
	hub      *Hub
	limits   *limiter
	sendCode func(context.Context, string, string) error
}

func New(db *sql.DB, c Config) *Server {
	s := &Server{db: db, cfg: c, hub: newHub(), limits: &limiter{entries: map[string]limitEntry{}}}
	s.sendCode = s.mailCode
	return s
}

type apiError struct {
	status  int
	message string
}

func (e *apiError) Error() string   { return e.message }
func bad(message string) error      { return &apiError{400, message} }
func denied() error                 { return &apiError{403, "Доступ запрещён"} }
func missing() error                { return &apiError{404, "Не найдено"} }
func conflict(message string) error { return &apiError{409, message} }
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func writeError(w http.ResponseWriter, err error) {
	if errors.Is(err, context.Canceled) {
		return
	}
	var ae *apiError
	if errors.As(err, &ae) {
		writeJSON(w, ae.status, M{"error": ae.message})
		return
	}
	var pg *pgconn.PgError
	if errors.As(err, &pg) {
		if pg.Code == "23505" {
			writeJSON(w, 409, M{"error": "Такая запись уже существует"})
			return
		}
		if pg.Code == "23503" {
			writeJSON(w, 400, M{"error": "Связанная запись недоступна"})
			return
		}
	}
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, 404, M{"error": "Не найдено"})
		return
	}
	slog.Error("request failed", "kind", fmt.Sprintf("%T", err))
	writeJSON(w, 500, M{"error": "Не удалось выполнить запрос"})
}
func decode(r *http.Request) (M, error) {
	d := json.NewDecoder(io.LimitReader(r.Body, 1024*1024+1))
	var body M
	if err := d.Decode(&body); err != nil || body == nil {
		return nil, bad("Некорректный JSON")
	}
	if d.Decode(new(any)) != io.EOF {
		return nil, bad("Ожидается один JSON-объект")
	}
	return body, nil
}
func str(m M, k string) string { v, _ := m[k].(string); return v }
func nullable(v string) any {
	if v == "" {
		return nil
	}
	return v
}
func arrayStrings(v any) ([]string, bool) {
	a, ok := v.([]any)
	if !ok {
		return nil, false
	}
	out := []string{}
	for _, item := range a {
		s, ok := item.(string)
		if !ok || s == "" {
			return nil, false
		}
		out = append(out, s)
	}
	return out, true
}
func number(v any) int { f, _ := v.(float64); return int(f) }
func integer(v string, d, max int) int {
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		return d
	}
	if n > max {
		return max
	}
	return n
}
func newID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return "z" + hex.EncodeToString(b)
}
func digest(s string) string { b := sha256.Sum256([]byte(s)); return hex.EncodeToString(b[:]) }
func now() time.Time         { return time.Now().UTC().Truncate(time.Millisecond) }
func one(ctx context.Context, q Querier, sqlText string, args ...any) (M, error) {
	var raw []byte
	if err := q.QueryRowContext(ctx, sqlText, args...).Scan(&raw); err != nil {
		return nil, err
	}
	var result M
	err := json.Unmarshal(raw, &result)
	normalizeTimes(result)
	return result, err
}
func many(ctx context.Context, q Querier, sqlText string, args ...any) ([]M, error) {
	rows, err := q.QueryContext(ctx, sqlText, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []M{}
	for rows.Next() {
		var raw []byte
		if err = rows.Scan(&raw); err != nil {
			return nil, err
		}
		var value M
		if err = json.Unmarshal(raw, &value); err != nil {
			return nil, err
		}
		normalizeTimes(value)
		out = append(out, value)
	}
	return out, rows.Err()
}
func exists(ctx context.Context, q Querier, query string, args ...any) (bool, error) {
	var found bool
	err := q.QueryRowContext(ctx, "SELECT EXISTS("+query+")", args...).Scan(&found)
	return found, err
}
func affected(result sql.Result, err error) error {
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return missing()
	}
	return nil
}
func (s *Server) transaction(ctx context.Context, fn func(Querier) error) error {
	for attempt := 0; attempt < 3; attempt++ {
		tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
		if err != nil {
			return err
		}
		err = fn(tx)
		if err == nil {
			err = tx.Commit()
		} else {
			_ = tx.Rollback()
		}
		var pg *pgconn.PgError
		if errors.As(err, &pg) && (pg.Code == "40001" || pg.Code == "40P01") && attempt < 2 {
			continue
		}
		return err
	}
	return errors.New("transaction retry exhausted")
}
func success() M { return M{"success": true} }
func originURL(raw string) (*url.URL, bool) {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.User != nil || u.Opaque != "" || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, false
	}
	return u, true
}
func normalizedHost(host, scheme string) string {
	host = strings.ToLower(host)
	if scheme == "https" {
		host = strings.TrimSuffix(host, ":443")
	} else if scheme == "http" {
		host = strings.TrimSuffix(host, ":80")
	}
	return host
}
func requestOrigin(r *http.Request) (*url.URL, bool) {
	u, ok := originURL(r.Header.Get("Origin"))
	if !ok {
		return nil, false
	}
	return u, normalizedHost(u.Host, u.Scheme) == normalizedHost(r.Host, u.Scheme)
}
func sameOrigin(r *http.Request, publicURL string) bool {
	if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
		return false
	}
	if r.Header.Get("Origin") == "" {
		return true
	}
	origin, hostMatches := requestOrigin(r)
	if origin == nil {
		return false
	}
	// The browser-facing Host is authoritative, even when an old NEXTAUTH_URL is stale.
	// HTTPS may terminate at nginx; do not require the internal Go connection to use TLS.
	if hostMatches {
		return true
	}
	if allowed, ok := originURL(publicURL); ok {
		return normalizedHost(origin.Host, origin.Scheme) == normalizedHost(allowed.Host, allowed.Scheme) && origin.Scheme == allowed.Scheme
	}
	return false
}

type limitEntry struct {
	count int
	until time.Time
}
type limiter struct {
	sync.Mutex
	entries map[string]limitEntry
}

func (l *limiter) allow(key string, max int, window time.Duration) bool {
	l.Lock()
	defer l.Unlock()
	t := time.Now()
	if len(l.entries) > 10000 {
		for k, v := range l.entries {
			if t.After(v.until) {
				delete(l.entries, k)
			}
		}
		if len(l.entries) > 20000 {
			return false
		}
	}
	v := l.entries[key]
	if t.After(v.until) {
		v = limitEntry{until: t.Add(window)}
	}
	if v.count >= max {
		return false
	}
	v.count++
	l.entries[key] = v
	return true
}
func remoteKey(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

// PostgreSQL timestamp-without-time-zone fields hold UTC, as in the previous Prisma API.
func normalizeTimes(value any) {
	switch v := value.(type) {
	case map[string]any:
		for key, item := range v {
			if text, ok := item.(string); ok && strings.HasSuffix(key, "At") {
				if parsed, err := time.Parse("2006-01-02T15:04:05.999999999", text); err == nil {
					v[key] = parsed.UTC().Format(time.RFC3339Nano)
				}
			}
			normalizeTimes(v[key])
		}
	case []any:
		for _, item := range v {
			normalizeTimes(item)
		}
	}
}
