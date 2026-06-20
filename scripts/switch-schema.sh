#!/bin/bash
# Switch Prisma schema between SQLite (local) and PostgreSQL (production)
# Usage: ./scripts/switch-schema.sh [sqlite|postgresql]

TARGET=${1:-postgresql}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ "$TARGET" = "sqlite" ]; then
  echo "🔄 Switching to SQLite schema for local development..."
  cp "$PROJECT_DIR/prisma/schema.sqlite.prisma" "$PROJECT_DIR/prisma/schema.prisma"
  echo "✅ Now using SQLite schema"
elif [ "$TARGET" = "postgresql" ] || [ "$TARGET" = "postgres" ]; then
  echo "🔄 Switching to PostgreSQL schema for production..."
  echo "✅ PostgreSQL schema is the default (schema.prisma)"
else
  echo "Usage: $0 [sqlite|postgresql]"
  exit 1
fi

cd "$PROJECT_DIR" && npx prisma generate
echo "✅ Prisma Client regenerated"
