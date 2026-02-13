#!/bin/sh
set -e

echo "Starting ClawDeck API..."

# Wait for database to be ready
if [ -n "$DATABASE_URL" ]; then
  echo "Waiting for database connection..."

  # Extract host from DATABASE_URL
  DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
  DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')

  # Default to postgres:5432 if not found
  DB_HOST=${DB_HOST:-postgres}
  DB_PORT=${DB_PORT:-5432}

  echo "Checking database at $DB_HOST:$DB_PORT"

  # Wait for database
  until nc -z "$DB_HOST" "$DB_PORT"; do
    echo "Database is unavailable - sleeping"
    sleep 2
  done

  echo "Database is available!"

  # Run migrations if AUTO_MIGRATE is true (default)
  if [ "${AUTO_MIGRATE:-true}" = "true" ]; then
    echo "Running database migrations with Prisma..."

    # Generate Prisma client first (needed for migrations)
    echo "Generating Prisma client..."
    npx prisma generate

    # Apply pending Prisma migrations
    echo "Applying Prisma migrations..."
    npx prisma migrate deploy || {
      echo "Warning: Prisma migrate deploy failed, attempting to continue..."
      # Try to create schema if it doesn't exist
      npx prisma db push --accept-data-loss || echo "Could not push schema"
    }

    echo "Database migrations completed"
  fi

  # Seed database if AUTO_SEED is true
  if [ "${AUTO_SEED:-false}" = "true" ]; then
    echo "Seeding database..."
    npx prisma db seed || echo "Seeding completed or no seed needed"
  fi
fi

# Start the application
echo "Starting API server..."
exec node src/server.js
