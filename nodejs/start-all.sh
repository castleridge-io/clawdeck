#!/bin/bash
# ClawDeck Startup Script

echo "Starting ClawDeck..."

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Start Backend
echo "Starting Backend API on port 3001..."
cd /home/montelai/tools/clawdeck/nodejs
NODE_ENV=development node src/server.js &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Start Frontend
echo "Starting Frontend on port 3002..."
cd /home/montelai/tools/clawdeck/nodejs/frontend
npx vite --port 3002 --host 0.0.0.0 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

echo ""
echo "ClawDeck is running!"
echo "  Frontend: http://192.168.50.106:3002"
echo "  API:      http://192.168.50.106:3001/api/v1"
echo ""
echo "Press Ctrl+C to stop both services"

# Handle shutdown
trap "echo 'Stopping services...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

# Wait for processes
wait
