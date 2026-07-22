#!/bin/sh
set -e

echo "Applying database migrations..."
export PATH="/app/node_modules/.bin:$PATH"
prisma migrate deploy 

echo "Running seed..."
prisma db seed

echo "Starting server..."
exec node server.js



