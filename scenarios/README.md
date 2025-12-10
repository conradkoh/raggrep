# Test Scenarios

This folder contains test scenarios for validating RAGgrep's search functionality.

## Purpose

Test scenarios provide realistic codebases that can be indexed and searched to:

1. **Validate search ranking** - Ensure relevant files rank highly for queries
2. **Test semantic search** - Verify that conceptual queries find appropriate code
3. **Catch regressions** - Detect when changes break existing functionality
4. **Benchmark new features** - Test new file types or search capabilities

## Directory Structure

```
scenarios/
├── README.md           # This file
├── basic/              # Basic multi-file TypeScript/JS project
│   ├── README.md       # Scenario-specific documentation
│   ├── run-sanity-checks.sh
│   ├── test-queries.md
│   └── src/...         # Test source files
└── [future-scenario]/  # Add new scenarios here
```

## How to Use

### Running Tests on a Scenario

```bash
# Navigate to the scenario folder
cd scenarios/basic

# Index the scenario
bun run ../../src/app/cli/main.ts index

# Run queries
bun run ../../src/app/cli/main.ts query "your search query" --top 5

# Or use the sanity check script (if available)
./run-sanity-checks.sh
```

### Creating a New Scenario

1. Create a new folder under `scenarios/`:

   ```bash
   mkdir scenarios/my-scenario
   ```

2. Add a `README.md` explaining the scenario's purpose and expected queries

3. Add test files that represent a realistic codebase structure

4. Create a `test-queries.md` documenting expected query results

5. (Optional) Add a `run-sanity-checks.sh` script for automated testing

## Scenario Guidelines

When creating a new scenario:

- **Be realistic** - Use patterns from real-world codebases
- **Cover diverse file types** - Include TypeScript, JavaScript, JSON, Markdown, etc.
- **Include documentation** - Add README and doc files that mention the same concepts as code
- **Document expected results** - Specify which files should rank highly for each query
- **Keep it focused** - Each scenario should test specific capabilities

## Available Scenarios

| Scenario | Description                                 | File Types            | Focus Area                       |
| -------- | ------------------------------------------- | --------------------- | -------------------------------- |
| `basic`  | Multi-file web app with auth, database, API | TS, JS, JSON, MD, SQL | General search, semantic queries |

## Integration with CI

These scenarios can be run as part of the test suite:

```bash
bun test src/tests/integration.test.ts
```

The integration tests use files from `scenarios/basic/` (previously `.simulation/`).

## Adding Test Cases

When you find a search query that doesn't return expected results:

1. Document the issue in the scenario's `test-queries.md`
2. Add a formal test case in `src/tests/integration.test.ts`
3. Fix the ranking issue
4. Verify the fix with the sanity check script




