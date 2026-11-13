package server

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"net"
	"net/mail"
	"net/smtp"
	"strings"
	"time"
)

func (s *Server) mailCode(ctx context.Context, email, code string) error {
	c := s.cfg
	if c.SMTPHost == "" || c.SMTPFrom == "" {
		return fmt.Errorf("SMTP not configured")
	}
	address := net.JoinHostPort(c.SMTPHost, c.SMTPPort)
	tlsConfig := &tls.Config{ServerName: c.SMTPHost, MinVersion: tls.VersionTLS12}
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	var conn net.Conn
	var err error
	if c.SMTPPort == "465" {
		conn, err = tls.DialWithDialer(dialer, "tcp", address, tlsConfig)
	} else {
		conn, err = dialer.DialContext(ctx, "tcp", address)
	}
	if err != nil {
		return err
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(15 * time.Second))
	client, err := smtp.NewClient(conn, c.SMTPHost)
	if err != nil {
		return err
	}
	defer client.Close()
	if c.SMTPPort != "465" {
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err = client.StartTLS(tlsConfig); err != nil {
				return err
			}
		} else if c.SMTPTLS || c.SMTPUser != "" {
			return fmt.Errorf("SMTP TLS required")
		}
	}
	if c.SMTPUser != "" {
		if err = client.Auth(smtp.PlainAuth("", c.SMTPUser, c.SMTPPass, c.SMTPHost)); err != nil {
			return err
		}
	}
	from, err := mail.ParseAddress(c.SMTPFrom)
	if err != nil {
		return err
	}
	if err = client.Mail(from.Address); err != nil {
		return err
	}
	if err = client.Rcpt(email); err != nil {
		return err
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	sender := (&mail.Address{Name: c.SMTPFromName, Address: from.Address}).String()
	subject := "=?UTF-8?B?" + base64.StdEncoding.EncodeToString([]byte("Код подтверждения Zephyr")) + "?="
	body := "Код подтверждения: " + code + "\n\nОн действует 10 минут. Если вы не регистрировались, проигнорируйте письмо."
	_, err = fmt.Fprintf(writer, "From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n%s\r\n", sender, strings.TrimSpace(email), subject, base64.StdEncoding.EncodeToString([]byte(body)))
	if err != nil {
		return err
	}
	if err = writer.Close(); err != nil {
		return err
	}
	return client.Quit()
}
