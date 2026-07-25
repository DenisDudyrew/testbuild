-- Создаём GIN-индекс на searchContent для полнотекстового поиска сообщений
-- Используем pg_trgm для поддержки LIKE/ILIKE запросов с contains
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN-индекс на searchContent для быстрого поиска по подстроке (ILIKE)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_searchContent_gin_idx"
ON "Message"
USING gin (searchContent gin_trgm_ops)
WHERE searchContent IS NOT NULL AND deletedAt IS NULL;

-- Комбинированный индекс для поиска в рамках одного conversation
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_conversation_searchContent_idx"
ON "Message" ("conversationId", searchContent)
WHERE searchContent IS NOT NULL AND deletedAt IS NULL;