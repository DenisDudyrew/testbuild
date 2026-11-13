CREATE TABLE "_zephyr_sessions" (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "_zephyr_sessions_user_idx" ON "_zephyr_sessions"(user_id);
CREATE INDEX "_zephyr_sessions_expiry_idx" ON "_zephyr_sessions"(expires_at);
