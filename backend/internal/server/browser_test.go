package server

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestBrowserAgainstGo(t *testing.T) {
	if os.Getenv("ZEPHYR_BROWSER_CHECK") != "1" {
		t.Skip("set ZEPHYR_BROWSER_CHECK=1 after npm run build")
	}
	db := memoryDB(t)
	root, err := filepath.Abs("../../..")
	if err != nil {
		t.Fatal(err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	listener.Close()
	uiURL := fmt.Sprintf("http://127.0.0.1:%d", port)
	prepare := exec.Command("node", "-e", `const fs=require('fs'),p=require('path'),root=process.argv[1],target=p.join(root,'.next/standalone');fs.cpSync(p.join(root,'.next/static'),p.join(target,'.next/static'),{recursive:true});for(const name of fs.readdirSync(p.join(root,'public'))){if(name!=='uploads')fs.cpSync(p.join(root,'public',name),p.join(target,'public',name),{recursive:true});}`, root)
	if output, err := prepare.CombinedOutput(); err != nil {
		t.Fatalf("prepare standalone: %v %s", err, output)
	}
	cmd := exec.Command("node", filepath.Join(root, ".next/standalone/server.js"))
	cmd.Dir = root
	cmd.Env = append(os.Environ(), "NODE_ENV=production", "PORT="+fmt.Sprint(port), "HOSTNAME=127.0.0.1")
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	if err = cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = cmd.Process.Kill(); _ = cmd.Wait() }()
	ready := false
	client := &http.Client{Timeout: time.Second}
	for attempt := 0; attempt < 100; attempt++ {
		response, e := client.Get(uiURL)
		if e == nil {
			response.Body.Close()
			if response.StatusCode == 200 {
				ready = true
				break
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	if !ready {
		t.Fatal("UI did not start")
	}
	cfg := Config{AuthSecret: "browser-test-secret", EncryptionKey: "browser-test-key", UploadDir: t.TempDir(), LegacyUploadDir: t.TempDir(), UIOrigin: uiURL}
	app := New(db, cfg)
	defer app.Close()
	codes := map[string]string{}
	app.sendCode = func(_ context.Context, email, code string) error { codes[email] = code; return nil }
	handler := app.Handler()
	for _, name := range []string{"alice", "bob"} {
		c := &testClient{t, handler, map[string]*http.Cookie{}}
		email := name + "@example.com"
		c.do("POST", "/api/auth/send-verification", M{"email": email}, 200)
		c.do("POST", "/api/auth/confirm-email", M{"email": email, "code": codes[email]}, 200)
		c.do("POST", "/api/register", M{"email": email, "username": name, "password": "password123"}, 201)
	}
	live := httptest.NewServer(handler)
	defer live.Close()
	browser := exec.Command("node", filepath.Join(root, "scripts/browser-smoke.mjs"), live.URL)
	browser.Dir = root
	browser.Env = os.Environ()
	output, err := browser.CombinedOutput()
	t.Log(string(output))
	if err != nil {
		t.Fatal(err)
	}
}
