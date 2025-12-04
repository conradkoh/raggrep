# Basic Scenario

A realistic multi-file web application for testing RAGgrep's core search functionality.

## Purpose

This scenario tests:

- **TypeScript/JavaScript indexing** - Functions, classes, interfaces, types
- **Semantic search** - Finding code by concept rather than exact keywords
- **Cross-file-type search** - Finding related content in code, docs, and config
- **Symbol extraction** - Matching function names, class names, etc.
- **Path-based search** - Finding files by folder/filename keywords

## File Structure

```
basic/
├── README.md               # This file
├── run-sanity-checks.sh    # Automated test runner
├── test-queries.md         # Expected query results
├── package.json            # Project metadata
│
├── config/
│   └── default.json        # JSON configuration (rate limits, auth settings)
│
├── docs/
│   ├── README.md           # Project overview
│   ├── authentication.md   # Auth system documentation
│   └── database.md         # Database guide
│
├── scripts/
│   └── seed-data.sql       # Database seed script
│
└── src/
    ├── api/
    │   ├── middleware/
    │   │   └── auth.ts     # JWT authentication middleware
    │   └── routes/
    │       └── users.ts    # User CRUD endpoints
    │
    ├── auth/
    │   ├── login.ts        # User login & JWT generation
    │   └── session.ts      # Session management
    │
    ├── config/
    │   └── index.js        # Config loader (JavaScript)
    │
    ├── database/
    │   ├── connection.ts   # PostgreSQL connection pool
    │   └── models/
    │       └── user.ts     # User database model
    │
    ├── services/
    │   ├── cache.ts        # Redis caching service
    │   └── email.ts        # Email sending service
    │
    └── utils/
        ├── logger.ts       # Structured logging
        └── validation.ts   # Input validation helpers
```

## How to Run Tests

### Quick Start

```bash
# From this directory
./run-sanity-checks.sh
```

### Manual Testing

```bash
# Index the scenario
bun run ../../src/app/cli/main.ts index

# Run a query
bun run ../../src/app/cli/main.ts query "user authentication" --top 5
```

## Expected Query Results

See `test-queries.md` for the full list. Key examples:

| Query                      | Expected Top Result              | Why                                  |
| -------------------------- | -------------------------------- | ------------------------------------ |
| "user authentication"      | `src/auth/login.ts`              | Contains `authenticateUser` function |
| "database connection pool" | `src/database/connection.ts`     | Has DB pool implementation           |
| "password hashing"         | `src/auth/login.ts:hashPassword` | Exact function match                 |
| "send welcome email"       | `src/services/email.ts`          | Email service with templates         |
| "JWT token verification"   | `src/auth/login.ts:verifyToken`  | JWT verify function                  |
| "redis cache"              | `src/services/cache.ts`          | Cache service implementation         |

## File Types Covered

| Extension | Count | Examples                             |
| --------- | ----- | ------------------------------------ |
| `.ts`     | 10    | Authentication, database, API routes |
| `.js`     | 1     | Config loader                        |
| `.json`   | 2     | package.json, default.json           |
| `.md`     | 4     | Documentation files                  |
| `.sql`    | 1     | Database seed script                 |

## Test Categories

### 1. Exact Symbol Matching

Queries that should find specific function/class names:

- `authenticateUser` → `src/auth/login.ts`
- `validateSession` → `src/auth/session.ts`
- `sendPasswordResetEmail` → `src/services/email.ts`

### 2. Semantic/Conceptual Search

Queries using natural language:

- "how to verify user password" → Should find auth code
- "database transaction handling" → Should find connection.ts

### 3. Cross-Type Search

Queries that should find both code and documentation:

- "authentication" → Code in `src/auth/` AND `docs/authentication.md`
- "database setup" → Code in `src/database/` AND `docs/database.md`

### 4. Configuration Search

Queries for config files:

- "rate limit" → `config/default.json`
- "JWT expiry" → `config/default.json`

## Known Issues / Areas for Improvement

1. **API routes ranking** - "user registration endpoint" sometimes ranks model above routes
2. **Doc vs code priority** - Documentation sometimes ranks above source code for generic terms

## Adding New Test Files

When adding files to this scenario:

1. Place them in the appropriate directory under `src/`
2. Update this README's file structure section
3. Add expected queries to `test-queries.md`
4. Update `run-sanity-checks.sh` if adding new test cases

