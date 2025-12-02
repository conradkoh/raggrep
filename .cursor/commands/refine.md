# Refine RAGgrep Search Quality

Run manual sanity checks on the RAGgrep search system to ensure ranking quality.

## Instructions

1. **Setup the test scenario** (if not already done):

   - The `scenarios/basic` folder contains realistic test files
   - Run `cd scenarios/basic && bun run ../../src/app/cli/main.ts index` to index

2. **Run sanity checks**:

   ```bash
   cd scenarios/basic

   # Test 1: User authentication (expect: src/auth/login.ts)
   bun run ../../src/app/cli/main.ts query "user authentication" --top 5

   # Test 2: Database connection (expect: src/database/connection.ts)
   bun run ../../src/app/cli/main.ts query "database connection pool" --top 5

   # Test 3: Password handling (expect: hashPassword function)
   bun run ../../src/app/cli/main.ts query "password hashing" --top 5

   # Test 4: Session management (expect: src/auth/session.ts)
   bun run ../../src/app/cli/main.ts query "session validation" --top 5

   # Test 5: Email service (expect: src/services/email.ts)
   bun run ../../src/app/cli/main.ts query "send welcome email" --top 5

   # Test 6: Cache (expect: src/services/cache.ts)
   bun run ../../src/app/cli/main.ts query "redis cache" --top 5

   # Test 7: JWT (expect: verifyToken function)
   bun run ../../src/app/cli/main.ts query "JWT token verification" --top 5

   # Test 8: API routes (expect: src/api/routes/users.ts)
   bun run ../../src/app/cli/main.ts query "user registration endpoint" --top 5

   # Test 9: JSON config files
   bun run ../../src/app/cli/main.ts query "rate limit configuration" --top 5

   # Test 10: SQL files
   bun run ../../src/app/cli/main.ts query "seed test users" --top 5
   ```

3. **Analyze ranking results**:

   - Top result should match expected file
   - Score should be > 40% for good matches
   - Related files should appear in top 5

4. **If ranking issues found**:

   - Create a formal test case in `src/tests/integration.test.ts`
   - Investigate the scoring in `src/domain/services/bm25.ts` or `src/modules/core/index.ts`
   - Check tokenization in `src/domain/services/keywords.ts`
   - For semantic search, check `src/modules/language/typescript/index.ts`

5. **If file type not supported**:
   - Add extension to `DEFAULT_EXTENSIONS` in `src/domain/entities/config.ts`
   - Consider if a new module is needed for that language

## Test Scenarios

Test files are organized in the `scenarios/` folder. See `scenarios/README.md` for details.

### Basic Scenario (`scenarios/basic/`)

```
scenarios/basic/
├── README.md                 # Scenario documentation
├── run-sanity-checks.sh      # Automated test script
├── test-queries.md           # Expected query results
├── config/
│   └── default.json          # JSON config file
├── docs/
│   ├── README.md             # Project documentation
│   ├── authentication.md     # Auth guide
│   └── database.md           # Database guide
├── scripts/
│   └── seed-data.sql         # SQL seed file
└── src/
    ├── api/                  # REST API routes
    ├── auth/                 # Authentication (login, session)
    ├── config/               # Config loader (JS)
    ├── database/             # DB connection, models
    ├── services/             # Email, cache services
    └── utils/                # Logger, validation
```

### Adding New Scenarios

Create a new folder under `scenarios/` with:

- `README.md` - Explain the scenario and expected results
- `test-queries.md` - Document expected query results
- `run-sanity-checks.sh` - Automated test script (optional)

## Common Issues

1. **File type not indexed**: Check `DEFAULT_EXTENSIONS` in `src/domain/entities/config.ts`
2. **Keyword not found**: Check tokenization in `src/domain/services/bm25.ts`
3. **Wrong file ranked first**: Check score weighting in module's search function
4. **Semantic mismatch**: May need embedding model tuning or better chunking

## Adding New Test Cases

Add new test files to `scenarios/basic/` (or create a new scenario) and update `test-queries.md` with expected results.
