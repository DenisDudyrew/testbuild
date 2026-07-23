#!/bin/sh
set -e

echo "Applying database migrations..."
export PATH="/app/node_modules/.bin:$PATH"
prisma migrate deploy 

echo "Skipping seed (run manually: docker exec -it <container> npx prisma db seed)"

echo "Starting server..."
# Запускаем кастомный сервер с Socket.IO (скомпилирован из server.ts)
if [ -f server.custom.js ]; then
  exec node server.custom.js
else
  exec node server.js
fi



