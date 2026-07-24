#!/bin/sh
set -e

echo "Checking database connection..."
export PATH="/app/node_modules/.bin:$PATH"

# Ждём, пока БД будет готова (до 30 секунд)
MAX_RETRIES=30
i=0
until [ $i -ge $MAX_RETRIES ]; do
  if echo "SELECT 1" | prisma db execute --stdin 2>/dev/null; then
    echo "Database is ready!"
    break
  fi
  i=$((i + 1))
  echo "Waiting for database... ($i/$MAX_RETRIES)"
  sleep 1
done

if [ $i -ge $MAX_RETRIES ]; then
  echo "WARNING: Database did not respond in time, attempting migrations anyway..."
fi

echo "Applying database migrations..."
prisma migrate deploy

echo "Skipping seed (run manually: docker exec -it <container> npx prisma db seed)"

echo "Starting server..."
# Запускаем кастомный сервер с Socket.IO (скомпилирован из server.ts)
# server.custom.js компилируется esbuild в .next/standalone/ (см. Dockerfile)
# На всякий случай проверяем оба пути
if [ -f .next/standalone/server.custom.js ]; then
  echo "Starting custom server with Socket.IO support..."
  exec node .next/standalone/server.custom.js
elif [ -f server.custom.js ]; then
  echo "Starting custom server with Socket.IO support (fallback)..."
  exec node server.custom.js
else
  echo "Starting default Next.js standalone server (Socket.IO will NOT work)..."
  exec node server.js
fi

