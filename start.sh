#!/bin/sh
set -e

echo "DB_URL is set: ${DB_URL:+yes}${DB_URL:-NO - variable is empty or missing}"

if [ -z "$DB_URL" ]; then
  echo "ERROR: DB_URL is not set."
  exit 1
fi

echo "Running database migrations..."
DATABASE_URL="$DB_URL" npx prisma migrate deploy

echo "Starting Next.js..."
DATABASE_URL="$DB_URL" exec npx next start
