package server

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
)

func encryptText(secret, plaintext string) (string, error) {
	if secret == "" {
		return "", errors.New("missing encryption key")
	}
	key := sha256.Sum256([]byte(secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	iv := make([]byte, 12)
	if _, err = rand.Read(iv); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nil, iv, []byte(plaintext), nil)
	tag := sealed[len(sealed)-16:]
	data := sealed[:len(sealed)-16]
	return hex.EncodeToString(iv) + ":" + hex.EncodeToString(tag) + ":" + hex.EncodeToString(data), nil
}
func decryptText(secret, text string) (string, error) {
	parts := strings.Split(text, ":")
	if len(parts) != 3 {
		return text, nil
	}
	if secret == "" {
		return "", errors.New("missing encryption key")
	}
	iv, e := hex.DecodeString(parts[0])
	if e != nil {
		return "", e
	}
	tag, e := hex.DecodeString(parts[1])
	if e != nil {
		return "", e
	}
	data, e := hex.DecodeString(parts[2])
	if e != nil {
		return "", e
	}
	key := sha256.Sum256([]byte(secret))
	block, e := aes.NewCipher(key[:])
	if e != nil {
		return "", e
	}
	gcm, e := cipher.NewGCM(block)
	if e != nil {
		return "", e
	}
	if len(iv) != gcm.NonceSize() || len(tag) != gcm.Overhead() {
		return "", errors.New("invalid ciphertext")
	}
	plain, e := gcm.Open(nil, iv, append(data, tag...), nil)
	return string(plain), e
}
func (s *Server) codeHash(email, code string) string {
	h := hmac.New(sha256.New, []byte(s.cfg.AuthSecret))
	h.Write([]byte(email + ":" + code))
	return "code:" + hex.EncodeToString(h.Sum(nil))
}
