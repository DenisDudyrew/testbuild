#!/bin/sh
set -e

echo "Applying database migrations..."
export PATH="/app/node_modules/.bin:$PATH"
prisma migrate deploy 

echo "Skipping seed (run manually: docker exec -it <container> npx prisma db seed)"

echo "Starting server..."
exec node server.js



