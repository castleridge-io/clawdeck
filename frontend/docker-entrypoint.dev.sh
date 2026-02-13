#!/bin/sh
set -e

echo "=== Frontend entrypoint starting ==="

cd /app

# Check if node_modules exists and has vite
if [ ! -f "node_modules/.bin/vite" ]; then
  echo "Installing dependencies (vite not found)..."
  yarn install
fi

echo "Starting dev server..."
cd /app/frontend
exec yarn dev --host
