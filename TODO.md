# Code Review: Critical Bug Fixes ✅

## Выполнено:
- [x] Проведён полный code review проекта (найдено 6 критических проблем)

## Исправленные баги:
### 🔴 Критические
- [x] 1. **`docker-entrypoint.sh`** — исправлен путь к `server.custom.js` (теперь проверяет `.next/standalone/server.custom.js`)
- [x] 2. **`Dockerfile`** — убран `--external:bcrypt` из esbuild
- [x] 3. **`/api/users/me`** — уже существует, всё ок
- [x] 4. **`package.json`** — удалены `bcrypt` + `@types/bcrypt` (оставлен `bcryptjs`)
- [x] 5. **`docker-compose.yml`** — SMTP настройки восстановлены
- [x] 6. **`docker-entrypoint.sh`** — добавлен цикл ожидания БД перед миграциями (до 30 секунд)
