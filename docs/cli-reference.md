# CLI Reference

## Primary Commands

### `raggrep query`

Search your codebase using natural language. **This is the main command you'll use.**

```bash
raggrep query <search query> [options]
```

The index is managed automatically:

- First query creates the index
- Changed files are re-indexed automatically
- Deleted files are cleaned up automatically
- Unchanged files use the cached index (instant)

**Arguments:**

| Argument         | Description                              |
| ---------------- | ---------------------------------------- |
| `<search query>` | Natural language search query (required) |

**Options:**

| Flag              | Short | Description                                                |
| ----------------- | ----- | ---------------------------------------------------------- |
| `--top <n>`       | `-k`  | Number of results to return (default: 10)                  |
| `--min-score <n>` | `-s`  | Minimum similarity 0-1 (default: 0.15)                     |
| `--type <ext>`    | `-t`  | Filter by file extension (e.g., ts, tsx, js)               |
| `--filter <path>` | `-f`  | Filter by path or glob pattern (can be used multiple times)|
| `--help`          | `-h`  | Show help message                                          |

**Filter Patterns:**

The `--filter` flag supports both path prefixes and glob patterns:

| Pattern Type | Example | Matches |
| ------------ | ------- | ------- |
| Path prefix | `src/auth` | All files in `src/auth/` |
| Extension glob | `*.ts` | All TypeScript files |
| Extension glob | `*.md` | All Markdown files |
| Path glob | `src/**/*.test.ts` | All test files in `src/` |

**Multiple Filters (OR Logic):**

Use multiple `--filter` flags to match files that match **any** of the patterns:

```bash
raggrep query "component" --filter "*.ts" --filter "*.tsx"  # .ts OR .tsx files
raggrep query "api" --filter src/api --filter src/routes    # Multiple directories
raggrep query "config" --filter "*.json" --filter config/   # Mix glob and path
```

**Examples:**

```bash
# Basic search
raggrep query "user authentication"

# Limit results
raggrep query "handle errors" --top 5

# Lower threshold for more results
raggrep query "database" --min-score 0.1

# Filter by file type
raggrep query "interface" --type ts

# Filter by path
raggrep query "login" --filter src/auth

# Multiple path filters
raggrep query "api" --filter src/api --filter src/routes

# Combine options
raggrep query "component" --type tsx --top 5 --filter src/components

# Search only source code files
raggrep query "service controller" --filter "*.ts"
raggrep query "component state" --filter "*.tsx"

# Search only documentation
raggrep query "deployment workflow" --filter "*.md"
raggrep query "API reference" --filter "*.md"

# Search test files
raggrep query "mock setup" --filter "*.test.ts"
raggrep query "test helpers" --filter "**/*.spec.ts"
```

**Output Format:**

```
Found 3 results:

1. src/auth/authService.ts:24-55 (login)
   Score: 34.4% | Type: function | via TypeScript | exported
      export async function login(credentials: LoginCredentials): Promise<AuthResult> {

2. src/users/types.ts:3-12 (User)
   Score: 26.0% | Type: interface | via TypeScript | exported
      export interface User {
```

Results include:

- File path and line numbers
- Symbol name (if applicable)
- Relevance score (percentage)
- Code type (function, class, interface, etc.)
- Contributing module (TypeScript, Core)
- Export status
- Code preview

---

### `raggrep index --watch`

Keep the index fresh in real-time while you code.

```bash
raggrep index --watch [options]
```

**Options:**

| Flag                | Short | Description                                             |
| ------------------- | ----- | ------------------------------------------------------- |
| `--watch`           | `-w`  | Watch for file changes (required for watch mode)        |
| `--model <name>`    | `-m`  | Embedding model to use (default: `bge-small-en-v1.5`)   |
| `--concurrency <n>` | `-c`  | Number of parallel workers (default: auto based on CPU) |
| `--verbose`         | `-v`  | Show detailed progress for each file                    |
| `--help`            | `-h`  | Show help message                                       |

**Examples:**

```bash
# Watch mode
raggrep index --watch

# Watch with verbose output
raggrep index --watch --verbose

# Watch with different model
raggrep index --watch --model nomic-embed-text-v1.5

# Watch with custom concurrency
raggrep index --watch --concurrency 8
```

**Watch Mode Output:**

```
RAGgrep Indexer
================

Indexing directory: /Users/you/project
Index location: /tmp/raggrep-indexes/abc123
...

┌─────────────────────────────────────────┐
│  Watching for changes... (Ctrl+C to stop) │
└─────────────────────────────────────────┘

[Watch] language/typescript: 2 indexed, 0 errors
```

Watch mode:

- Monitors file changes using efficient native events
- Debounces rapid changes (e.g., during git operations)
- Only re-indexes changed files
- Press `Ctrl+C` to stop

---

## Utility Commands

### `raggrep status`

Show the current state of the index.

```bash
raggrep status
```

**Output (indexed):**

```
┌─────────────────────────────────────────┐
│  RAGgrep Status                         │
├─────────────────────────────────────────┤
│  ● Indexed                              │
└─────────────────────────────────────────┘

  Files:    49         Updated: 2h ago
  Location: /tmp/raggrep-indexes/abc123

  Modules:
    └─ core (49 files)
    └─ language/typescript (49 files)
```

**Output (not indexed):**

```
┌─────────────────────────────────────────┐
│  RAGgrep Status                         │
├─────────────────────────────────────────┤
│  ○ Not indexed                          │
└─────────────────────────────────────────┘

  Directory: /Users/you/project

  Run "raggrep query" to create an index.
```

---

### `raggrep index`

Explicitly index the current directory. Usually not needed since `raggrep query` auto-indexes.

```bash
raggrep index [options]
```

**Options:**

| Flag                | Short | Description                                             |
| ------------------- | ----- | ------------------------------------------------------- |
| `--watch`           | `-w`  | Watch for file changes and re-index automatically       |
| `--model <name>`    | `-m`  | Embedding model to use (default: `bge-small-en-v1.5`)   |
| `--concurrency <n>` | `-c`  | Number of parallel workers (default: auto based on CPU) |
| `--verbose`         | `-v`  | Show detailed progress for each file                    |
| `--help`            | `-h`  | Show help message                                       |

**Available Models:**

| Model                     | Dimensions | Size   | Notes                              |
| ------------------------- | ---------- | ------ | ---------------------------------- |
| `bge-small-en-v1.5`       | 384        | ~33MB  | **Default**, best balance for code |
| `nomic-embed-text-v1.5`   | 768        | ~270MB | Higher quality, larger             |
| `all-MiniLM-L6-v2`        | 384        | ~23MB  | Fast, good general purpose         |
| `all-MiniLM-L12-v2`       | 384        | ~33MB  | Higher quality than L6             |
| `paraphrase-MiniLM-L3-v2` | 384        | ~17MB  | Fastest, lower quality             |

**Examples:**

```bash
# Basic indexing
raggrep index

# Use a different model
raggrep index --model nomic-embed-text-v1.5

# Set concurrency
raggrep index --concurrency 8

# Verbose output
raggrep index --verbose
```

---

### `raggrep reset`

Clear the index for the current directory.

```bash
raggrep reset [options]
```

**Options:**

| Flag     | Short | Description       |
| -------- | ----- | ----------------- |
| `--help` | `-h`  | Show help message |

**Examples:**

```bash
raggrep reset
```

This completely removes the index. The next `raggrep index` or `raggrep query` will rebuild from scratch.

---

### `raggrep --version`

Show the current version.

```bash
raggrep --version
raggrep -v
```

---

### `raggrep --help`

Show help and available commands.

```bash
raggrep --help
raggrep -h
```

## Exit Codes

| Code | Description                                      |
| ---- | ------------------------------------------------ |
| 0    | Success                                          |
| 1    | Error (invalid arguments, indexing failed, etc.) |

## Environment

**Model Cache:**

```
~/.cache/raggrep/models/
```

**Index Location:**

```
/tmp/raggrep-indexes/<project-hash>/
```

Use `raggrep status` to see the exact location.
