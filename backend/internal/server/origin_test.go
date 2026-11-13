package server

import (
	"crypto/tls"
	"net/http/httptest"
	"testing"
)

func TestOriginBehindReverseProxy(t *testing.T) {
	cases := []struct {
		name, host, origin, configured, site string
		allowed, secure                      bool
	}{
		{"production with stale config", "zephyr.alexhomeserv.ru", "https://zephyr.alexhomeserv.ru", "https://your-domain.com", "same-origin", true, true},
		{"nginx TLS termination", "zephyr.alexhomeserv.ru", "https://zephyr.alexhomeserv.ru", "http://localhost:3000", "same-origin", true, true},
		{"HTTP direct access with old HTTPS config", "192.168.1.10:8080", "http://192.168.1.10:8080", "https://your-domain.com", "same-origin", true, false},
		{"configured external host", "internal:3000", "https://zephyr.alexhomeserv.ru", "https://zephyr.alexhomeserv.ru", "same-origin", true, true},
		{"default HTTPS port", "zephyr.alexhomeserv.ru:443", "https://zephyr.alexhomeserv.ru", "", "same-origin", true, true},
		{"foreign site", "zephyr.alexhomeserv.ru", "https://attacker.example", "https://your-domain.com", "cross-site", false, false},
		{"forged same-origin claim", "zephyr.alexhomeserv.ru", "https://attacker.example", "", "same-origin", false, false},
		{"cross-site without origin", "zephyr.alexhomeserv.ru", "", "", "cross-site", false, false},
		{"null origin", "zephyr.alexhomeserv.ru", "null", "", "same-origin", false, false},
		{"origin userinfo", "zephyr.alexhomeserv.ru", "https://attacker@zephyr.alexhomeserv.ru", "", "same-origin", false, false},
		{"origin path", "zephyr.alexhomeserv.ru", "https://zephyr.alexhomeserv.ru/path", "", "same-origin", false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", "http://"+tc.host+"/api/auth/login", nil)
			if tc.origin != "" {
				r.Header.Set("Origin", tc.origin)
			}
			r.Header.Set("Sec-Fetch-Site", tc.site)
			if got := sameOrigin(r, tc.configured); got != tc.allowed {
				t.Fatalf("origin allowed=%v want=%v", got, tc.allowed)
			}
			s := New(nil, Config{PublicURL: tc.configured})
			if got := s.secure(r); got != tc.secure {
				t.Fatalf("secure cookie=%v want=%v", got, tc.secure)
			}
		})
	}
}
func TestTLSAlwaysUsesSecureCookies(t *testing.T) {
	r := httptest.NewRequest("POST", "https://localhost/api/auth/login", nil)
	r.TLS = &tls.ConnectionState{}
	if !New(nil, Config{}).secure(r) {
		t.Fatal("TLS must use secure cookies")
	}
}
