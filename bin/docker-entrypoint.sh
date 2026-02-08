#!/bin/bash
set -e

# Wait for database to be ready
until pg_isready -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USERNAME" > /dev/null 2>&1; do
  echo "Waiting for database..."
  sleep 1
done

# Create database if it doesn't exist
bundle exec rake db:create || echo "Database already exists"

# Run migrations
bundle exec rake db:migrate

# Execute the main command
exec "$@"
