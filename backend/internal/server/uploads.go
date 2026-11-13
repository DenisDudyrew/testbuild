package server

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

const maxUpload = 10 * 1024 * 1024

var filePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$`)
var uploadPattern = regexp.MustCompile(`^/(?:api/files|uploads)/([A-Za-z0-9][A-Za-z0-9._-]{0,199})$`)
var fileTypes = map[string]string{"image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm", "application/pdf": "pdf", "application/msword": "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx", "text/plain": "txt"}

func parseUpload(raw string) (string, bool) {
	matches := uploadPattern.FindStringSubmatch(raw)
	if len(matches) != 2 {
		return "", false
	}
	return matches[1], true
}
func imageExtension(name string) bool {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp":
		return true
	}
	return false
}
func fileURLs(filename string) (string, string) {
	return "/api/files/" + filename, "/uploads/" + filename
}
func publicFile(ctx context.Context, q Querier, filename string) (bool, error) {
	a, b := fileURLs(filename)
	return exists(ctx, q, `SELECT 1 FROM "Post" WHERE "mediaUrl" IN($1,$2) UNION ALL SELECT 1 FROM "User" WHERE avatar IN($1,$2) OR header IN($1,$2)`, a, b)
}
func (s *Server) canAttach(ctx context.Context, url, user string) (bool, error) {
	return s.canAttachWith(ctx, s.db, url, user)
}
func (s *Server) canAttachWith(ctx context.Context, q Querier, url, user string) (bool, error) {
	filename, ok := parseUpload(url)
	if !ok {
		return false, nil
	}
	var owner sql.NullString
	err := q.QueryRowContext(ctx, `SELECT "ownerId" FROM "Upload" WHERE filename=$1`, filename).Scan(&owner)
	legacy := errors.Is(err, sql.ErrNoRows)
	if err != nil && !legacy {
		return false, err
	}
	if owner.Valid && owner.String == user {
		return true, nil
	}
	published, err := publicFile(ctx, q, filename)
	if err != nil || published {
		return published, err
	}
	if legacy {
		a, b := fileURLs(filename)
		return exists(ctx, q, `SELECT 1 FROM "Message" m WHERE m."senderId"=$1 AND m."mediaUrl" IN($2,$3) AND `+visibleMessage("m", 1), user, a, b)
	}
	return false, nil
}
func (s *Server) canReadFile(ctx context.Context, user, filename string) (M, bool, error) {
	upload, err := one(ctx, s.db, `SELECT jsonb_build_object('ownerId',"ownerId",'originalName',"originalName",'contentType',"contentType") FROM "Upload" WHERE filename=$1`, filename)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	if str(upload, "ownerId") == user {
		return upload, true, nil
	}
	public, err := publicFile(ctx, s.db, filename)
	if err != nil || public {
		return upload, public, err
	}
	a, b := fileURLs(filename)
	allowed, err := exists(ctx, s.db, `SELECT 1 FROM "Message" m WHERE m."mediaUrl" IN($2,$3) AND `+visibleMessage("m", 1), user, a, b)
	return upload, allowed, err
}
func privateDirectory(dir string) (string, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return "", err
	}
	public, err := filepath.Abs("public")
	if err != nil {
		return "", err
	}
	if abs == public || strings.HasPrefix(abs, public+string(filepath.Separator)) {
		return "", errors.New("UPLOAD_DIR must be outside public")
	}
	return abs, nil
}
func validFileContent(data []byte, kind string) bool {
	detected := http.DetectContentType(data)
	switch kind {
	case "text/plain":
		return utf8.Valid(data) && !strings.ContainsRune(string(data), 0)
	case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
		return len(data) >= 4 && string(data[:4]) == "PK\x03\x04"
	case "application/msword":
		return len(data) >= 8 && string(data[:8]) == "\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
	default:
		return strings.Split(detected, ";")[0] == kind
	}
}
func (s *Server) upload(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	if !s.limits.allow("upload:"+u.ID, 30, time.Minute) {
		return nil, &apiError{429, "Слишком много загрузок"}
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUpload+1024*1024)
	if err := r.ParseMultipartForm(maxUpload); err != nil {
		return nil, bad("Файл слишком большой или некорректный")
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		return nil, bad("Нужен файл")
	}
	defer file.Close()
	kind, _, err := mime.ParseMediaType(header.Header.Get("Content-Type"))
	if err != nil {
		return nil, bad("Некорректный тип файла")
	}
	extension, ok := fileTypes[kind]
	if !ok {
		return nil, bad("Неподдерживаемый формат")
	}
	data, err := io.ReadAll(io.LimitReader(file, maxUpload+1))
	if err != nil {
		return nil, err
	}
	if len(data) == 0 || len(data) > maxUpload || !validFileContent(data, kind) {
		return nil, bad("Некорректный размер или содержимое файла")
	}
	directory, err := privateDirectory(s.cfg.UploadDir)
	if err != nil {
		return nil, err
	}
	if err = os.MkdirAll(directory, 0700); err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(directory)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	filename := newID() + "." + extension
	destination, err := root.OpenFile(filename, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return nil, err
	}
	_, writeErr := destination.Write(data)
	closeErr := destination.Close()
	if writeErr != nil || closeErr != nil {
		root.Remove(filename)
		if writeErr != nil {
			return nil, writeErr
		}
		return nil, closeErr
	}
	purpose := r.FormValue("purpose")
	if purpose != "post" && purpose != "profile" && purpose != "message" {
		purpose = "unattached"
	}
	name := header.Filename
	if len(name) > 255 {
		name = string([]rune(name)[:min(100, len([]rune(name)))])
	}
	_, err = s.db.ExecContext(r.Context(), `INSERT INTO "Upload"(id,filename,"ownerId","originalName","contentType",size,purpose) VALUES($1,$2,$3,$4,$5,$6,$7)`, newID(), filename, u.ID, name, kind, len(data), purpose)
	if err != nil {
		root.Remove(filename)
		return nil, err
	}
	mediaType := "file"
	if strings.HasPrefix(kind, "image/") {
		mediaType = "image"
	} else if strings.HasPrefix(kind, "video/") {
		mediaType = "video"
	}
	return M{"mediaUrl": "/api/files/" + filename, "mediaType": mediaType, "mediaName": name}, nil
}
func (s *Server) file(w http.ResponseWriter, r *http.Request, u User) (any, error) {
	filename := r.PathValue("filename")
	if !filePattern.MatchString(filename) {
		return nil, missing()
	}
	upload, allowed, err := s.canReadFile(r.Context(), u.ID, filename)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, missing()
	}
	private, err := privateDirectory(s.cfg.UploadDir)
	if err != nil {
		return nil, err
	}
	for _, directory := range []string{private, s.cfg.LegacyUploadDir} {
		if directory == "" {
			continue
		}
		root, err := os.OpenRoot(directory)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, err
		}
		stat, err := root.Lstat(filename)
		if err != nil {
			root.Close()
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return nil, missing()
		}
		if !stat.Mode().IsRegular() {
			root.Close()
			return nil, missing()
		}
		file, err := root.Open(filename)
		if err != nil {
			root.Close()
			return nil, missing()
		}
		kind := str(upload, "contentType")
		if kind == "" {
			kind = mime.TypeByExtension(filepath.Ext(filename))
		}
		if kind == "" {
			kind = "application/octet-stream"
		}
		name := str(upload, "originalName")
		if name == "" {
			name = filename
		}
		disposition := "attachment"
		if imageExtension(filename) || kind == "video/mp4" || kind == "video/webm" {
			disposition = "inline"
		}
		w.Header().Set("Cache-Control", "private, no-store, max-age=0")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Vary", "Cookie")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
		w.Header().Set("Content-Type", kind)
		w.Header().Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": name}))
		http.ServeContent(w, r, name, time.Time{}, file)
		file.Close()
		root.Close()
		return nil, nil
	}
	return nil, missing()
}
