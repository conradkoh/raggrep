# Test Queries for RAGgrep

This document tracks test queries and expected results for manual testing.

## Test Cases

### 1. Authentication Search

**Query:** "user authentication"
**Expected:** Should find `src/auth/login.ts` highly ranked

### 2. Password Handling

**Query:** "password hashing"
**Expected:** Should find `hashPassword` function in `src/auth/login.ts`

### 3. Database Connection

**Query:** "database connection pool"
**Expected:** Should find `src/database/connection.ts`

### 4. Session Management

**Query:** "session validation"
**Expected:** Should find `src/auth/session.ts`

### 5. Email Service

**Query:** "send welcome email"
**Expected:** Should find `src/services/email.ts`

### 6. Cache Operations

**Query:** "redis cache"
**Expected:** Should find `src/services/cache.ts`

### 7. JWT Token

**Query:** "JWT token verification"
**Expected:** Should find `verifyToken` function

### 8. API Routes

**Query:** "user registration endpoint"
**Expected:** Should find `src/api/routes/users.ts`

### 9. Logging

**Query:** "structured logging"
**Expected:** Should find `src/utils/logger.ts`

### 10. Validation

**Query:** "email validation"
**Expected:** Should find `src/utils/validation.ts`

## Cross-type Search

### Documentation

**Query:** "password requirements"
**Expected:** Should find `docs/authentication.md`

### Configuration

**Query:** "rate limit config"
**Expected:** Should find `config/default.json`

### SQL

**Query:** "seed test users"
**Expected:** Should find `scripts/seed-data.sql`
