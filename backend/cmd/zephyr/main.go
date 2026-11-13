package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"time"
	"zephyr/internal/server"
	"zephyr/migrations"
)

func run() error {
	if len(os.Args) > 1 && os.Args[1] == "openapi" {
		return json.NewEncoder(os.Stdout).Encode(server.New(nil, server.Config{}).OpenAPI())
	}
	cfg := server.ConfigFromEnv()
	if cfg.DatabaseURL == "" {
		return errors.New("DATABASE_URL is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	db, err := server.OpenDatabase(ctx, cfg)
	cancel()
	if err != nil {
		return fmt.Errorf("database is unavailable")
	}
	defer db.Close()
	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		if err = migrations.Apply(ctx, db); err != nil {
			return err
		}
		slog.Info("database migrations applied")
		return nil
	}
	if cfg.AuthSecret == "" || cfg.EncryptionKey == "" {
		return errors.New("AUTH_SECRET and ENCRYPTION_KEY are required")
	}
	if len(os.Args) > 1 && os.Args[1] == "promote-admin" {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.New(db, cfg).PromoteAdmin(ctx, os.Getenv("ADMIN_USERNAME"))
	}
	var ui *exec.Cmd
	uiExited := make(chan error, 1)
	if file := os.Getenv("UI_SERVER_PATH"); file != "" {
		ui = exec.Command("node", file)
		ui.Env = append(os.Environ(), "PORT=3001", "HOSTNAME=127.0.0.1")
		ui.Stdout = os.Stdout
		ui.Stderr = os.Stderr
		if err = ui.Start(); err != nil {
			return errors.New("cannot start UI")
		}
		go func() { uiExited <- ui.Wait() }()
		defer func() { _ = ui.Process.Kill() }()
	}
	app := server.New(db, cfg)
	httpServer := &http.Server{Addr: cfg.Address, Handler: app.Handler(), ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32 * 1024}
	stopped := make(chan error, 1)
	go func() {
		slog.Info("Zephyr Go API ready", "address", cfg.Address)
		stopped <- httpServer.ListenAndServe()
	}()
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGTERM, syscall.SIGINT)
	defer signal.Stop(signals)
	var exit error
	select {
	case <-signals:
	case err := <-stopped:
		if !errors.Is(err, http.ErrServerClosed) {
			exit = err
		}
	case <-uiExited:
		exit = errors.New("UI process stopped")
	}
	app.Close()
	ctx, cancel = context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(ctx)
	return exit
}
func main() {
	if err := run(); err != nil {
		slog.Error("startup failed", "error", err)
		os.Exit(1)
	}
}
