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

    # Generate Prisma client first
    echo "Generating Prisma client..."
    npx prisma generate

    # Push schema to database (creates/updates tables to match schema.prisma)
    echo "Pushing Prisma schema to database..."
    npx prisma db push --accept-data-loss || {
      echo "Warning: Prisma db push failed, attempting migrate deploy..."
      npx prisma migrate deploy || echo "Could not apply migrations"
    }

    echo "Database schema sync completed"
  fi

  # Seed database if AUTO_SEED is true
  if [ "${AUTO_SEED:-false}" = "true" ]; then
    echo "Seeding database..."
    npx prisma db seed || echo "Seeding completed or no seed needed"
  fi
fi

# Start the application (runs CMD or whatever command was passed)
echo "Starting: $@"
exec "$@"
