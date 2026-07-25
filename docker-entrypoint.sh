#!/bin/sh
set -e

echo "Applying database migrations..."
export PATH="/app/node_modules/.bin:$PATH"
prisma migrate deploy 

echo "Running database seed..."
prisma db seed || echo "Seed already applied (continuing)"

echo "Starting server..."
# Запускаем кастомный сервер с Socket.IO (скомпилирован из server.ts)
if [ -f server.custom.js ]; then
  exec node server.custom.js
else
  exec node server.js
fi



