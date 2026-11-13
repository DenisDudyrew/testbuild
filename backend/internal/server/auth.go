package server

import (
	"crypto/rand"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"errors"
	"golang.org/x/crypto/bcrypt"
	"math/big"
	"net/http"
	"net/mail"
	"regexp"
	"strings"
	"time"
)

const sessionCookie = "zephyr-session"
const proofCookie = "zephyr-registration"

type User struct {
	ID, Username, Password, Role, EmailEncrypted string
	Avatar, Header                               sql.NullString
	Verified                                     bool
}

var usernamePattern = regexp.MustCompile(`^[A-Za-z0-9_]{3,30}$`)

func randomToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func (s *Server) secure(r *http.Request) bool {
	return r.TLS != nil || strings.HasPrefix(s.cfg.PublicURL, "https://")
}
func (s *Server) cookie(w http.ResponseWriter, r *http.Request, name, value, path string, age int) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: path, MaxAge: age, HttpOnly: true, Secure: s.secure(r), SameSite: http.SameSiteLaxMode})
}
func (s *Server) authenticate(r *http.Request) (User, error) {
	var u User
	c, err := r.Cookie(sessionCookie)
	if err != nil || len(c.Value) != 64 {
		return u, &apiError{401, "Войдите в аккаунт"}
	}
	err = s.db.QueryRowContext(r.Context(), `SELECT u.id,u.username,u.password,u.role,u.avatar,u.header,u."emailEncrypted",u."emailVerified" FROM "_zephyr_sessions" se JOIN "User" u ON u.id=se.user_id WHERE se.token_hash=$1 AND se.expires_at>now()`, digest(c.Value)).Scan(&u.ID, &u.Username, &u.Password, &u.Role, &u.Avatar, &u.Header, &u.EmailEncrypted, &u.Verified)
	if errors.Is(err, sql.ErrNoRows) || (!u.Verified && err == nil) {
		return User{}, &apiError{401, "Войдите в аккаунт"}
	}
	return u, err
}
func sessionJSON(u User) M {
	return M{"user": M{"id": u.ID, "name": u.Username, "username": u.Username, "avatar": nullable(u.Avatar.String), "header": nullable(u.Header.String), "image": nullable(u.Avatar.String), "role": u.Role}, "expires": now().Add(30 * 24 * time.Hour).Format(time.RFC3339Nano)}
}
func (s *Server) session(w http.ResponseWriter, r *http.Request, _ User) (any, error) {
	u, err := s.authenticate(r)
	var ae *apiError
	if errors.As(err, &ae) && ae.status == 401 {
		return nilSession(), nil
	}
	if err != nil {
		return nil, err
	}
	return sessionJSON(u), nil
}
func nilSession() M { return M{} }
func (s *Server) login(w http.ResponseWriter, r *http.Request, _ User) (any, error) {
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	name, password := str(b, "username"), str(b, "password")
	if !usernamePattern.MatchString(name) || len(password) < 1 || len(password) > 128 {
		return nil, bad("Введите логин и пароль")
	}
	if !s.limits.allow("login-ip:"+remoteKey(r), 10, time.Minute) || !s.limits.allow("login-user:"+name, 20, 10*time.Minute) {
		return nil, &apiError{429, "Слишком много попыток входа"}
	}
	var u User
	err = s.db.QueryRowContext(r.Context(), `SELECT id,username,password,role,avatar,header,"emailEncrypted","emailVerified" FROM "User" WHERE username=$1`, name).Scan(&u.ID, &u.Username, &u.Password, &u.Role, &u.Avatar, &u.Header, &u.EmailEncrypted, &u.Verified)
	if errors.Is(err, sql.ErrNoRows) {
		_ = bcrypt.CompareHashAndPassword([]byte("$2a$10$7EqJtq98hPqEX7fNZaFWoO5F.bjUeVMP0eBCFdjv0i6DgSaB06Kq."), []byte(password))
		return nil, &apiError{401, "Неверный логин или пароль"}
	}
	if err != nil {
		return nil, err
	}
	if len(password) > 72 {
		password = password[:72]
	}
	if !u.Verified || u.Password == "__pending__" || bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(password)) != nil {
		return nil, &apiError{401, "Неверный логин или пароль"}
	}
	token := randomToken()
	_, err = s.db.ExecContext(r.Context(), `INSERT INTO "_zephyr_sessions"(token_hash,user_id,expires_at) VALUES($1,$2,$3)`, digest(token), u.ID, now().Add(30*24*time.Hour))
	if err != nil {
		return nil, err
	}
	s.cookie(w, r, sessionCookie, token, "/", 30*24*3600)
	return sessionJSON(u), nil
}
func (s *Server) logout(w http.ResponseWriter, r *http.Request, _ User) (any, error) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		var userID string
		err = s.db.QueryRowContext(r.Context(), `DELETE FROM "_zephyr_sessions" WHERE token_hash=$1 RETURNING user_id`, digest(c.Value)).Scan(&userID)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
		if err == nil {
			s.hub.disconnect(userID)
		}
	}
	s.cookie(w, r, sessionCookie, "", "/", -1)
	return success(), nil
}
func emailAddress(value string) (string, error) {
	email := strings.ToLower(strings.TrimSpace(value))
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email || len(email) > 254 {
		return "", bad("Некорректный email")
	}
	return email, nil
}
func (s *Server) sendVerification(w http.ResponseWriter, r *http.Request, _ User) (any, error) {
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	email, err := emailAddress(str(b, "email"))
	if err != nil {
		return nil, err
	}
	hash := digest(email)
	if !s.limits.allow("verify-ip:"+remoteKey(r), 10, time.Minute) || !s.limits.allow("verify-email:"+hash, 3, 10*time.Minute) {
		return nil, &apiError{429, "Слишком много писем. Попробуйте позже"}
	}
	n, err := rand.Int(rand.Reader, big.NewInt(900000))
	if err != nil {
		return nil, err
	}
	code := new(big.Int).Add(n, big.NewInt(100000)).String()
	encrypted, err := encryptText(s.cfg.EncryptionKey, email)
	if err != nil {
		return nil, err
	}
	result, err := s.db.ExecContext(r.Context(), `INSERT INTO "User"(id,username,password,"emailHash","emailEncrypted","emailVerified","verificationCode","verificationCodeExpires") VALUES($1,$2,'__pending__',$3,$4,false,$5,$6) ON CONFLICT("emailHash") DO UPDATE SET "emailVerified"=false,"verificationCode"=excluded."verificationCode","verificationCodeExpires"=excluded."verificationCodeExpires" WHERE "User".password='__pending__'`, newID(), "__pending_"+newID(), hash, encrypted, s.codeHash(hash, code), now().Add(10*time.Minute))
	if err != nil {
		return nil, err
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return nil, conflict("Этот email уже используется")
	}
	if err = s.sendCode(r.Context(), email, code); err != nil {
		return nil, &apiError{502, "Не удалось отправить письмо. Проверьте настройки SMTP"}
	}
	return success(), nil
}
func (s *Server) confirmEmail(w http.ResponseWriter, r *http.Request, _ User) (any, error) {
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	email, err := emailAddress(str(b, "email"))
	if err != nil {
		return nil, err
	}
	code := str(b, "code")
	if !regexp.MustCompile(`^\d{6}$`).MatchString(code) {
		return nil, bad("Введите шестизначный код")
	}
	hash := digest(email)
	if !s.limits.allow("confirm:"+hash, 10, 10*time.Minute) {
		return nil, &apiError{429, "Слишком много попыток. Запросите новый код позже"}
	}
	token := randomToken()
	result, err := s.db.ExecContext(r.Context(), `UPDATE "User" SET "emailVerified"=true,"verificationCode"=$1,"verificationCodeExpires"=$2 WHERE "emailHash"=$3 AND password='__pending__' AND "verificationCode"=$4 AND "verificationCodeExpires">now()`, "proof:"+digest(token), now().Add(10*time.Minute), hash, s.codeHash(hash, code))
	if err != nil {
		return nil, err
	}
	count, _ := result.RowsAffected()
	if count == 0 {
		return nil, bad("Неверный или истёкший код")
	}
	s.cookie(w, r, proofCookie, token, "/api/register", 600)
	return success(), nil
}
func (s *Server) register(w http.ResponseWriter, r *http.Request, _ User) (any, error) {
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	email, err := emailAddress(str(b, "email"))
	if err != nil {
		return nil, err
	}
	name, password := str(b, "username"), str(b, "password")
	if !usernamePattern.MatchString(name) || len(password) < 6 || len(password) > 72 {
		return nil, bad("Логин: 3–30 латинских букв, цифр или _. Пароль: 6–72 байта")
	}
	if !s.limits.allow("register:"+remoteKey(r), 10, time.Minute) {
		return nil, &apiError{429, "Слишком много попыток"}
	}
	proof, err := r.Cookie(proofCookie)
	if err != nil || len(proof.Value) != 64 {
		return nil, bad("Сначала подтвердите email в этом браузере")
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return nil, err
	}
	user, err := one(r.Context(), s.db, `UPDATE "User" SET username=$1,password=$2,"verificationCode"=NULL,"verificationCodeExpires"=NULL WHERE "emailHash"=$3 AND password='__pending__' AND "emailVerified"=true AND "verificationCode"=$4 AND "verificationCodeExpires">now() RETURNING jsonb_build_object('id',id,'username',username,'avatar',avatar,'header',header,'createdAt',"createdAt")`, name, string(hashed), digest(email), "proof:"+digest(proof.Value))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, bad("Подтверждение недействительно или уже использовано")
	}
	if err != nil {
		return nil, err
	}
	s.cookie(w, r, proofCookie, "", "/api/register", -1)
	return user, nil
}
func (s *Server) changePassword(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	b, err := decode(r)
	if err != nil {
		return nil, err
	}
	old, next := str(b, "currentPassword"), str(b, "newPassword")
	if len(next) < 6 || len(next) > 72 {
		return nil, bad("Пароль должен содержать 6–72 байта")
	}
	if !s.limits.allow("password:"+u.ID, 5, 10*time.Minute) {
		return nil, &apiError{429, "Слишком много попыток"}
	}
	if len(old) > 72 {
		old = old[:72]
	}
	if bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(old)) != nil {
		return nil, denied()
	}
	if subtle.ConstantTimeCompare([]byte(old), []byte(next)) == 1 {
		return nil, bad("Новый пароль совпадает со старым")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(next), 12)
	if err != nil {
		return nil, err
	}
	err = s.transaction(r.Context(), func(q Querier) error {
		if err := affected(q.ExecContext(r.Context(), `UPDATE "User" SET password=$1 WHERE id=$2 AND password=$3`, string(hash), u.ID, u.Password)); err != nil {
			return err
		}
		_, err := q.ExecContext(r.Context(), `DELETE FROM "_zephyr_sessions" WHERE user_id=$1`, u.ID)
		return err
	})
	if err != nil {
		return nil, err
	}
	s.cookie(w, r, sessionCookie, "", "/", -1)
	s.hub.disconnect(u.ID)
	return success(), nil
}
