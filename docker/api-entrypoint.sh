#!/bin/sh
set -e

echo "=== GhostCast API Startup ==="
echo "Environment: ${NODE_ENV:-production}"

# Run database migrations
echo "Running database migrations..."
cd /app/packages/database
npx prisma migrate deploy
echo "Migrations complete."

# Seed reference data (idempotent - safe to run on every deployment)
echo "Running production seed..."
node dist/prisma/seed.prod.js
echo "Production seed complete."

# Start the API server
cd /app
echo "Starting API server on port ${API_PORT:-4000}..."
exec node apps/api/dist/main
