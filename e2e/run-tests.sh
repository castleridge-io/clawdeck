#!/bin/bash
# E2E Test Runner
# Usage: ./e2e/run-tests.sh [--headed] [--debug] [--test=pattern]

set -e

E2E_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$E2E_DIR")"

cd "$PROJECT_ROOT"

# Parse arguments
HEADED=""
DEBUG=""
TEST_PATTERN=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --headed)
      HEADED="--headed"
      shift
      ;;
    --debug)
      DEBUG="--debug"
      shift
      ;;
    --test=*)
      TEST_PATTERN="--grep=${1#*=}"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--headed] [--debug] [--test=pattern]"
      exit 1
      ;;
  esac
done

echo "🧪 Running E2E tests..."
echo "   Headless: $([ -z "$HEADED" ] && echo "yes" || echo "no")"
echo "   Pattern: ${TEST_PATTERN:-"all tests"}"

# Check if e2e services are running
if ! docker ps | grep -q "clawdeck-e2e-api"; then
  echo ""
  echo "⚠️  E2E services not running. Starting them..."
  docker-compose -f docker-compose.e2e.yml up -d postgres-e2e api-e2e frontend-e2e

  echo "⏳ Waiting for services to be healthy..."
  sleep 10

  # Wait for API to be ready
  for i in {1..30}; do
    if curl -s http://localhost:4333/up > /dev/null 2>&1; then
      echo "✅ API is ready"
      break
    fi
    echo "   Waiting for API... ($i/30)"
    sleep 2
  done
fi

# Run tests
echo ""
echo "🏃 Executing Playwright tests..."
cd e2e

if [ -n "$DEBUG" ]; then
  npx playwright test --ui
elif [ -n "$HEADED" ]; then
  npx playwright test --headed $TEST_PATTERN
else
  npx playwright test $TEST_PATTERN
fi

echo ""
echo "✅ E2E tests completed"
