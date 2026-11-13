package server

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"golang.org/x/crypto/bcrypt"
	"io"
	"io/fs"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"zephyr/migrations"
)

type testClient struct {
	t       *testing.T
	handler http.Handler
	cookies map[string]*http.Cookie
}

func (c *testClient) do(method, path string, body any, status int) any {
	c.t.Helper()
	var reader io.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		reader = bytes.NewReader(raw)
	}
	r := httptest.NewRequest(method, "http://localhost"+path, reader)
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", "http://localhost")
	r.RemoteAddr = "127.0.0.1:12345"
	for _, cookie := range c.cookies {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	c.handler.ServeHTTP(w, r)
	if w.Code != status {
		c.t.Fatalf("%s %s: status %d, want %d: %s", method, path, w.Code, status, w.Body.String())
	}
	for _, cookie := range w.Result().Cookies() {
		if cookie.MaxAge < 0 {
			delete(c.cookies, cookie.Name)
		} else {
			c.cookies[cookie.Name] = cookie
		}
	}
	if w.Body.Len() == 0 {
		return nil
	}
	var value any
	if err := json.Unmarshal(w.Body.Bytes(), &value); err != nil {
		c.t.Fatalf("%s: invalid JSON: %s", path, w.Body.String())
	}
	return value
}
func object(v any) M   { m, _ := v.(map[string]any); return m }
func list(v any) []any { a, _ := v.([]any); return a }
func (c *testClient) upload(data []byte, name, kind string, status int) M {
	c.t.Helper()
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	header := textproto.MIMEHeader{}
	header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename="%s"`, name))
	header.Set("Content-Type", kind)
	part, _ := form.CreatePart(header)
	part.Write(data)
	form.WriteField("purpose", "message")
	form.Close()
	r := httptest.NewRequest("POST", "http://localhost/api/upload", &body)
	r.Header.Set("Content-Type", form.FormDataContentType())
	for _, cookie := range c.cookies {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	c.handler.ServeHTTP(w, r)
	if w.Code != status {
		c.t.Fatalf("upload: %d: %s", w.Code, w.Body.String())
	}
	var value M
	json.Unmarshal(w.Body.Bytes(), &value)
	return value
}
func (c *testClient) file(path string, status int, rangeHeader string) *httptest.ResponseRecorder {
	c.t.Helper()
	r := httptest.NewRequest("GET", "http://localhost"+path, nil)
	for _, cookie := range c.cookies {
		r.AddCookie(cookie)
	}
	if rangeHeader != "" {
		r.Header.Set("Range", rangeHeader)
	}
	w := httptest.NewRecorder()
	c.handler.ServeHTTP(w, r)
	if w.Code != status {
		c.t.Fatalf("file %s: %d expected %d: %s", path, w.Code, status, w.Body.String())
	}
	return w
}
func TestApplicationAgainstMemoryPostgres(t *testing.T) {
	db := memoryDB(t)
	directory := t.TempDir()
	cfg := Config{AuthSecret: "test-auth-secret", EncryptionKey: "test-encryption-key", UploadDir: directory, LegacyUploadDir: filepath.Join(directory, "legacy"), UIOrigin: "http://127.0.0.1:1"}
	app := New(db, cfg)
	defer app.Close()
	codes := map[string]string{}
	app.sendCode = func(_ context.Context, email, code string) error { codes[email] = code; return nil }
	handler := app.Handler()
	clients := map[string]*testClient{}
	ids := map[string]string{}
	for _, name := range []string{"alice", "bob", "eve", "root"} {
		c := &testClient{t, handler, map[string]*http.Cookie{}}
		clients[name] = c
		email := name + "@example.com"
		c.do("POST", "/api/auth/send-verification", M{"email": email}, 200)
		c.do("POST", "/api/auth/confirm-email", M{"email": email, "code": codes[email]}, 200)
		profile := object(c.do("POST", "/api/register", M{"email": email, "username": name, "password": "password123"}, 201))
		ids[name] = str(profile, "id")
		session := object(c.do("POST", "/api/auth/login", M{"username": name, "password": "password123"}, 200))
		if str(object(session["user"]), "id") != ids[name] {
			t.Fatal("wrong authenticated identity")
		}
	}
	alice, bob, eve, root := clients["alice"], clients["bob"], clients["eve"], clients["root"]
	anonymous := &testClient{t, handler, map[string]*http.Cookie{}}
	t.Run("migration_is_idempotent", func(t *testing.T) {
		if err := migrations.Apply(context.Background(), db); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("registration_cannot_replace_an_account", func(t *testing.T) {
		eve.do("POST", "/api/register", M{"email": "alice@example.com", "username": "stolen", "password": "password123"}, 400)
		if _, err := db.Exec(`UPDATE "User" SET role='admin' WHERE id=$1`, ids["root"]); err != nil {
			t.Fatal(err)
		}
	})
	post := object(alice.do("POST", "/api/posts", M{"content": "Привет #тест"}, 201))
	postID := str(post, "id")
	t.Run("posts_comments_and_feed", func(t *testing.T) {
		anonymous.do("GET", "/api/posts", nil, 401)
		alice.do("GET", "/api/posts?page=-1&limit=bad", nil, 200)
		bob.do("GET", "/api/posts/"+postID, nil, 200)
		comment := object(bob.do("POST", "/api/posts/"+postID+"/comments", M{"content": "Круто"}, 201))
		cid := str(comment, "id")
		eve.do("POST", "/api/posts/"+postID+"/comments", M{"content": "Согласна", "parentId": cid}, 201)
		comments := list(alice.do("GET", "/api/posts/"+postID+"/comments", nil, 200))
		if len(comments) != 1 || len(list(object(comments[0])["replies"])) != 1 {
			t.Fatal("reply hierarchy missing")
		}
		bob.do("POST", "/api/comments/"+cid+"/like", nil, 200)
		bob.do("POST", "/api/comments/"+cid+"/repost", M{"content": "репост"}, 201)
		like := object(bob.do("POST", "/api/posts/"+postID+"/like", nil, 200))
		if like["liked"] != true {
			t.Fatal("like not persisted")
		}
		bob.do("POST", "/api/posts/"+postID+"/like", nil, 200)
		bob.do("POST", "/api/bookmarks", M{"postId": postID}, 200)
		if len(list(bob.do("GET", "/api/bookmarks", nil, 200))) != 1 {
			t.Fatal("bookmark absent")
		}
		bob.do("POST", "/api/bookmarks", M{"postId": postID}, 200)
		bob.do("POST", "/api/users/"+ids["alice"]+"/follow", nil, 200)
		following := object(bob.do("GET", "/api/feed/following", nil, 200))
		if len(list(following["posts"])) != 1 {
			t.Fatal("following feed missing post")
		}
		alice.do("GET", "/api/feed/for-you", nil, 200)
		bob.do("GET", "/api/users/"+ids["alice"]+"/follow", nil, 200)
		alice.do("PUT", "/api/posts/"+postID+"/edit", M{"content": "Обновлено #новое"}, 200)
		bob.do("PUT", "/api/posts/"+postID+"/edit", M{"content": "wrong author"}, 404)
		alice.do("POST", "/api/posts/"+postID+"/pin", nil, 200)
		bob.do("POST", "/api/posts/"+postID+"/view", nil, 200)
		bob.do("GET", "/api/posts/search?q=Обновлено", nil, 200)
		bob.do("GET", "/api/posts/search?hashtag=%23новое", nil, 200)
		bob.do("GET", "/api/users/search?q=ali", nil, 200)
		bob.do("GET", "/api/hashtags/trending", nil, 200)
		bob.do("GET", "/api/explore", nil, 200)
		bob.do("GET", "/api/users/"+ids["alice"], nil, 200)
		alice.do("GET", "/api/notifications", nil, 200)
		alice.do("PUT", "/api/notifications/read", nil, 200)
	})
	t.Run("polls", func(t *testing.T) {
		poll := object(alice.do("POST", "/api/polls", M{"postId": postID, "question": "Как?", "options": []string{"хорошо", "отлично"}}, 201))
		pid := str(poll, "id")
		options := list(poll["options"])
		choice := str(object(options[0]), "id")
		bob.do("POST", "/api/polls/vote", M{"pollId": pid, "optionId": choice}, 200)
		result := object(bob.do("GET", "/api/polls/vote?pollId="+pid, nil, 200))
		if str(result, "votedOptionId") != choice {
			t.Fatal("vote not returned")
		}
		bob.do("POST", "/api/polls/vote", M{"pollId": pid, "optionId": str(object(options[1]), "id")}, 200)
		var votes int
		if err := db.QueryRow(`SELECT count(*) FROM "Vote" WHERE "userId"=$1`, ids["bob"]).Scan(&votes); err != nil || votes != 1 {
			t.Fatalf("vote invariant: %d %v", votes, err)
		}
	})
	var conversationID, messageID string
	t.Run("conversation_and_message_lifecycle", func(t *testing.T) {
		chat := object(alice.do("POST", "/api/messenger/conversations", M{"participantIds": []string{ids["bob"]}}, 201))
		conversationID = str(chat, "id")
		same := object(bob.do("POST", "/api/messenger/conversations", M{"participantIds": []string{ids["alice"]}}, 201))
		if str(same, "id") != conversationID {
			t.Fatal("duplicate direct chat")
		}
		prefix := "/api/messenger/conversations/" + conversationID
		eve.do("GET", prefix+"/messages", nil, 403)
		alice.do("GET", "/api/messenger/conversations", nil, 200)
		bob.do("GET", prefix, nil, 200)
		sent := object(alice.do("POST", prefix+"/messages", M{"content": "Привет в чате", "tempId": "temp-test"}, 201))
		messageID = str(sent, "id")
		if messageID == "temp-test" {
			t.Fatal("temporary id replaced permanent id")
		}
		again := object(alice.do("POST", prefix+"/messages", M{"content": "Привет в чате", "tempId": "temp-test"}, 201))
		if str(again, "id") != messageID {
			t.Fatal("retry duplicated message")
		}
		if _, ok := sent["searchContent"]; ok {
			t.Fatal("plaintext index exposed")
		}
		bob.do("POST", prefix+"/messages", M{"content": "Ответ", "replyToId": messageID}, 201)
		history := object(bob.do("GET", prefix+"/messages?limit=1", nil, 200))
		cursor := str(history, "nextCursor")
		if cursor == "" {
			t.Fatal("missing history cursor")
		}
		bob.do("GET", prefix+"/messages?cursor="+strings.ReplaceAll(cursor, "|", "%7C"), nil, 200)
		alice.do("PATCH", "/api/messenger/messages/"+messageID, M{"content": "Изменённый текст"}, 200)
		bob.do("PATCH", "/api/messenger/messages/"+messageID, M{"content": "wrong author"}, 403)
		bob.do("GET", prefix+"/search?q=Изменённый", nil, 200)
		bob.do("POST", "/api/messenger/messages/"+messageID+"/reactions", M{"emoji": "❤️"}, 200)
		bob.do("POST", prefix+"/pin", M{"messageId": messageID}, 200)
		bob.do("GET", prefix+"/pinned", nil, 200)
		bob.do("GET", "/api/messenger/messages/"+messageID, nil, 200)
		bob.do("POST", prefix+"/typing", nil, 200)
		alice.do("GET", prefix+"/typing", nil, 200)
		bob.do("DELETE", prefix+"/typing", nil, 200)
		bob.do("GET", prefix+"/media", nil, 200)
		bob.do("GET", "/api/messenger/unread", nil, 200)
		bob.do("GET", "/api/messenger/users?q=ali", nil, 200)
	})
	t.Run("attachment_permissions_and_legacy_alias", func(t *testing.T) {
		png, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2pZsAAAAASUVORK5CYII=")
		upload := alice.upload(png, "photo.png", "image/png", 201)
		url := str(upload, "mediaUrl")
		alice.file(url, 200, "")
		bob.file(url, 404, "")
		anonymous.file(url, 401, "")
		bob.do("POST", "/api/posts", M{"content": "stolen", "mediaUrl": url, "mediaType": "image"}, 403)
		bob.do("PUT", "/api/users/me", M{"avatar": url}, 403)
		prefix := "/api/messenger/conversations/" + conversationID
		media := object(alice.do("POST", prefix+"/messages", M{"content": "фото", "mediaUrl": url, "mediaType": "image"}, 201))
		mediaID := str(media, "id")
		bob.file(url, 200, "")
		eve.file(url, 404, "")
		ranged := bob.file(url, 206, "bytes=0-3")
		if len(ranged.Body.Bytes()) != 4 || !strings.Contains(ranged.Header().Get("Cache-Control"), "no-store") {
			t.Fatal("range/cache policy wrong")
		}
		bob.file(strings.Replace(url, "/api/files/", "/uploads/", 1), 200, "")
		eve.file(strings.Replace(url, "/api/files/", "/%75ploads/", 1), 404, "")
		bob.do("DELETE", "/api/messenger/messages/"+mediaID+"?mode=forMe", nil, 200)
		bob.file(url, 404, "")
		alice.file(url, 200, "")
		alice.do("POST", "/api/posts", M{"content": "публичное фото", "mediaUrl": url, "mediaType": "image"}, 201)
		bob.file(url, 200, "")
		alice.do("PUT", "/api/users/me", M{"avatar": url, "bio": "Привет"}, 200)
		alice.do("GET", "/api/users/me", nil, 200)
		alice.do("POST", "/api/users/me/last-seen", nil, 200)
		alice.upload([]byte("<html>not a PNG</html>"), "fake.png", "image/png", 400)
		filename, _ := parseUpload(url)
		if err := os.MkdirAll(cfg.LegacyUploadDir, 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.Rename(filepath.Join(directory, filename), filepath.Join(cfg.LegacyUploadDir, filename)); err != nil {
			t.Fatal(err)
		}
		bob.file("/uploads/"+filename, 200, "")
	})
	t.Run("individual_deletion_and_blocking", func(t *testing.T) {
		alice.do("DELETE", "/api/messenger/messages/"+messageID+"?mode=forMe", nil, 200)
		bob.do("DELETE", "/api/messenger/messages/"+messageID+"?mode=forMe", nil, 200)
		alice.do("GET", "/api/messenger/messages/"+messageID, nil, 404)
		bob.do("GET", "/api/messenger/messages/"+messageID, nil, 404)
		bob.do("POST", "/api/messenger/block", M{"userId": ids["alice"]}, 201)
		alice.do("POST", "/api/messenger/conversations/"+conversationID+"/messages", M{"content": "blocked"}, 403)
		bob.do("GET", "/api/messenger/block", nil, 200)
		bob.do("DELETE", "/api/messenger/block", M{"userId": ids["alice"]}, 200)
	})
	t.Run("admin_and_release_notes", func(t *testing.T) {
		alice.do("GET", "/api/admin/users", nil, 403)
		root.do("GET", "/api/admin/users", nil, 200)
		root.do("GET", "/api/admin/posts", nil, 200)
		note := object(root.do("POST", "/api/admin/release-notes", M{"title": "Go", "content": "Новый сервер"}, 201))
		nid := str(note, "id")
		root.do("PUT", "/api/admin/release-notes/"+nid, M{"title": "Go update", "content": "Обновлено"}, 200)
		alice.do("GET", "/api/release-notes", nil, 200)
		root.do("DELETE", "/api/admin/release-notes/"+nid, nil, 200)
		root.do("PUT", "/api/admin/users/"+ids["eve"], M{"username": "eve_new", "role": "user"}, 200)
	})
	t.Run("csrf_and_session_revocation", func(t *testing.T) {
		r := httptest.NewRequest("POST", "http://localhost/api/posts", strings.NewReader(`{"content":"csrf"}`))
		r.Header.Set("Origin", "https://attacker.example")
		r.AddCookie(alice.cookies[sessionCookie])
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != 403 {
			t.Fatal("CSRF accepted")
		}
		bob.do("PUT", "/api/users/me/password", M{"currentPassword": "password123", "newPassword": "newPassword123"}, 200)
		bob.do("GET", "/api/users/me", nil, 401)
		bob.do("POST", "/api/auth/login", M{"username": "bob", "password": "newPassword123"}, 200)
		bob.do("POST", "/api/auth/logout", nil, 200)
		bob.do("GET", "/api/users/me", nil, 401)
		anonymous.do("GET", "/api/auth/session", nil, 200)
	})
	t.Run("legacy_accounts_need_not_reconfirm_email", func(t *testing.T) {
		raw, err := os.ReadFile("../../testdata/crypto.json")
		if err != nil {
			t.Fatal(err)
		}
		var fixture map[string]string
		if err = json.Unmarshal(raw, &fixture); err != nil {
			t.Fatal(err)
		}
		id := newID()
		email, err := encryptText(cfg.EncryptionKey, "legacy@example.com")
		if err != nil {
			t.Fatal(err)
		}
		if _, err = db.Exec(`INSERT INTO "User"(id,username,password,"emailHash","emailEncrypted","emailVerified") VALUES($1,'старый.логин',$2,$3,$4,false)`, id, fixture["passwordHash"], digest("legacy@example.com"), email); err != nil {
			t.Fatal(err)
		}
		legacy := &testClient{t, handler, map[string]*http.Cookie{}}
		legacy.do("POST", "/api/auth/login", M{"username": "старый.логин", "password": fixture["password"]}, 200)
		legacy.do("GET", "/api/users/me", nil, 200)
		alice.do("GET", "/api/users/"+id, nil, 200)
		var verified bool
		if err = db.QueryRow(`SELECT "emailVerified" FROM "User" WHERE id=$1`, id).Scan(&verified); err != nil || verified {
			t.Fatal("legacy login must not falsely mark email as verified")
		}
		pendingID := newID()
		if _, err = db.Exec(`INSERT INTO "User"(id,username,password,"emailHash","emailEncrypted","emailVerified") VALUES($1,'pending_account','__pending__',$2,$3,false)`, pendingID, digest("pending@example.com"), email); err != nil {
			t.Fatal(err)
		}
		legacy.do("POST", "/api/auth/login", M{"username": "pending_account", "password": "__pending__"}, 401)
	})
	t.Run("existing_prisma_history_is_preserved", func(t *testing.T) {
		before, err := one(context.Background(), db, `SELECT jsonb_build_object('id',id,'password',password,'emailEncrypted',"emailEncrypted") FROM "User" WHERE id=$1`, ids["alice"])
		if err != nil {
			t.Fatal(err)
		}
		if _, err = db.Exec(`CREATE TABLE "_prisma_migrations"(migration_name TEXT,checksum TEXT,finished_at TIMESTAMPTZ,rolled_back_at TIMESTAMPTZ); DELETE FROM "_zephyr_migrations"; DROP TABLE "_zephyr_sessions"; ALTER TABLE "PollOption" DROP COLUMN position;`); err != nil {
			t.Fatal(err)
		}
		names, err := fs.Glob(migrations.Files, "*/migration.sql")
		if err != nil {
			t.Fatal(err)
		}
		for _, name := range names {
			directory := strings.TrimSuffix(name, "/migration.sql")
			if directory >= "20261113230000" {
				continue
			}
			body, _ := migrations.Files.ReadFile(name)
			if _, err = db.Exec(`INSERT INTO "_prisma_migrations"(migration_name,checksum,finished_at) VALUES($1,$2,now())`, directory, digest(string(body))); err != nil {
				t.Fatal(err)
			}
		}
		if err = migrations.Apply(context.Background(), db); err != nil {
			t.Fatal(err)
		}
		after, err := one(context.Background(), db, `SELECT jsonb_build_object('id',id,'password',password,'emailEncrypted',"emailEncrypted") FROM "User" WHERE id=$1`, ids["alice"])
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(before, after) {
			t.Fatal("existing account changed during migration")
		}
	})

}
func TestCryptoCompatibility(t *testing.T) {
	const secret = "test-encryption-key"
	const input = "hello 🌊"
	encrypted, err := encryptText(secret, input)
	if err != nil {
		t.Fatal(err)
	}
	plain, err := decryptText(secret, encrypted)
	if err != nil || plain != input {
		t.Fatal("AES-GCM round trip failed")
	}
	if _, err = decryptText("wrong", encrypted); err == nil {
		t.Fatal("wrong key accepted")
	}
	if _, err = decryptText(secret, "00:00:00"); err == nil {
		t.Fatal("invalid nonce accepted")
	}
	if plain, err = decryptText(secret, "legacy plaintext"); err != nil || plain != "legacy plaintext" {
		t.Fatal("legacy content lost")
	}
}
func TestHubIsolation(t *testing.T) {
	h := newHub()
	alice, _ := h.subscribe("alice")
	bob, _ := h.subscribe("bob")
	h.publish("alice", "message:new", M{"id": "message"})
	select {
	case <-alice.events:
	default:
		t.Fatal("event not delivered")
	}
	select {
	case <-bob.events:
		t.Fatal("event leaked to unrelated user")
	default:
	}
	h.disconnect("alice")
	select {
	case <-alice.done:
	default:
		t.Fatal("revoked stream still active")
	}
	h.remove("bob", bob)
}
func TestUTCNormalization(t *testing.T) {
	v := M{"createdAt": "2026-11-13T12:34:56.123", "nested": []any{M{"editedAt": "2026-11-13T12:34:56"}}}
	normalizeTimes(v)
	if v["createdAt"] != "2026-11-13T12:34:56.123Z" {
		t.Fatal(v)
	}
}

func TestLegacyRoutesCovered(t *testing.T) {
	raw, err := os.ReadFile("../../testdata/legacy-routes.json")
	if err != nil {
		t.Fatal(err)
	}
	var legacy []string
	if err = json.Unmarshal(raw, &legacy); err != nil {
		t.Fatal(err)
	}
	s := New(nil, Config{})
	registered := map[string]bool{}
	for _, route := range s.routes() {
		registered[route.pattern] = true
	}
	for _, route := range legacy {
		if !registered[route] {
			t.Errorf("legacy API route has no Go implementation: %s", route)
		}
	}
}

func TestPreviousNodeCryptoFormat(t *testing.T) {
	raw, err := os.ReadFile("../../testdata/crypto.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture map[string]string
	if err = json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	plain, err := decryptText(fixture["secret"], fixture["encrypted"])
	if err != nil || plain != fixture["plaintext"] {
		t.Fatal("cannot decrypt Node AES-256-GCM format")
	}
	if err = bcrypt.CompareHashAndPassword([]byte(fixture["passwordHash"]), []byte(fixture["password"])); err != nil {
		t.Fatal("cannot verify previous bcrypt hashes")
	}
}
