#!/bin/bash
# RAGgrep Sanity Check Script
# Run from the .simulation directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "RAGgrep Sanity Checks"
echo "========================================"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to run a test and check result
# Checks if expected file is in top 3 results
run_test() {
    local test_name="$1"
    local query="$2"
    local expected_file="$3"
    
    echo -e "${YELLOW}Test: $test_name${NC}"
    echo "Query: \"$query\""
    echo "Expected: $expected_file"
    
    # Get top 3 results
    results=$(bun run ../src/app/cli/main.ts query "$query" --top 3 2>/dev/null | grep -E "^[123]\." || echo "No results")
    top_result=$(echo "$results" | head -1)
    
    echo "Top result: $top_result"
    
    if echo "$results" | grep -q "$expected_file"; then
        if echo "$top_result" | grep -q "$expected_file"; then
            echo -e "${GREEN}✓ PASS (top 1)${NC}"
        else
            echo -e "${YELLOW}⚠ WARN - Expected file found but not top result${NC}"
        fi
    else
        echo -e "${RED}✗ FAIL - Expected file not in top 3 results${NC}"
    fi
    echo ""
}

# Index first (if needed)
echo "Ensuring index is up to date..."
bun run ../src/app/cli/main.ts index 2>/dev/null | tail -3
echo ""

# Run tests
run_test "User Authentication" "user authentication" "src/auth/login.ts"
run_test "Database Connection" "database connection pool" "src/database/connection.ts"
run_test "Password Hashing" "password hashing" "src/auth/login.ts"
run_test "Session Validation" "session validation" "src/auth/session.ts"
run_test "Email Service" "send welcome email" "src/services/email.ts"
run_test "Cache Service" "redis cache" "src/services/cache.ts"
run_test "JWT Verification" "JWT token verification" "src/auth/login.ts"
run_test "User API Routes" "user registration endpoint" "src/api/routes/users.ts"
run_test "Logger Utility" "structured logging" "src/utils/logger.ts"
run_test "Validation Utils" "email validation" "src/utils/validation.ts"

echo "========================================"
echo "Sanity checks complete"
echo "========================================"




