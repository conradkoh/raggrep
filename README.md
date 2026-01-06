# RAGgrep

**Local semantic search for codebases** — find code using natural language queries.

RAGgrep indexes your code and lets you search it using natural language. Everything runs locally — no external API calls required.

## Features

- **Zero-config search** — Just run `raggrep query` and it works. Index is created and updated automatically.
- **Multi-language support** — Deep understanding of TypeScript, JavaScript, Python, Go, and Rust with AST-aware parsing.
- **Vocabulary-based search** — Search `user` to find `getUserById`, `fetchUserData`, `UserService`, etc. Natural language queries like "where is user session validated" find `validateUserSession()`.
- **Local-first** — All indexing and search happens on your machine. No cloud dependencies.
- **Incremental** — Only re-indexes files that have changed. Instant search when nothing changed.
- **Watch mode** — Keep the index fresh in real-time as you code.
- **Hybrid search** — Combines semantic similarity with keyword matching for best results.
- **Literal boosting** — Exact identifier matches get priority. Use backticks for precise matching: `` `AuthService` ``.
- **Phrase matching** — Exact phrases in documentation are found even when semantic similarity is low.
- **Semantic expansion** — Domain-specific synonyms improve recall (function ↔ method, auth ↔ authentication).

## Installation

```bash
# Install globally
npm install -g raggrep

# Or use without installing
npx raggrep query "your search"
```

## Usage

### Search Your Code

```bash
cd your-project
raggrep query "user authentication"
```

That's it. The first query creates the index automatically. Subsequent queries are instant if files haven't changed. Modified files are re-indexed on the fly.

### Example Output

```
Index updated: 42 indexed

RAGgrep Search
==============

Searching for: "user authentication"

Found 3 results:

1. src/auth/authService.ts:24-55 (login)
   Score: 34.4% | Type: function | via TypeScript | exported
      export async function login(credentials: LoginCredentials): Promise<AuthResult> {
        const { email, password } = credentials;

2. src/auth/session.ts:10-25 (createSession)
   Score: 28.2% | Type: function | via TypeScript | exported
      export function createSession(user: User): Session {

3. src/users/types.ts:3-12 (User)
   Score: 26.0% | Type: interface | via TypeScript | exported
      export interface User {
        id: string;
```

### Watch Mode

Keep your index fresh in real-time while you code:

```bash
raggrep index --watch
```

This monitors file changes and re-indexes automatically. Useful during active development when you want instant search results.

```
┌─────────────────────────────────────────┐
│  Watching for changes... (Ctrl+C to stop) │
└─────────────────────────────────────────┘

[Watch] language/typescript: 2 indexed, 0 errors
```

## CLI Reference

### Commands

```bash
raggrep query <query>    # Search the codebase
raggrep index            # Build/update the index
raggrep status           # Show index status
raggrep reset            # Clear the index
```

### Query Options

```bash
raggrep query "user login"                    # Basic search
raggrep query "error handling" --top 5        # Limit results
raggrep query "database" --min-score 0.2      # Set minimum score threshold
raggrep query "interface" --type ts           # Filter by file extension
raggrep query "auth" --filter src/auth        # Filter by path
raggrep query "api" -f src/api -f src/routes  # Multiple path filters
raggrep query "\`AuthService\` class"         # Exact identifier match (backticks)
```

| Flag              | Short | Description                                                |
| ----------------- | ----- | ---------------------------------------------------------- |
| `--top <n>`       | `-k`  | Number of results to return (default: 10)                  |
| `--min-score <n>` | `-s`  | Minimum similarity score 0-1 (default: 0.15)               |
| `--type <ext>`    | `-t`  | Filter by file extension (e.g., ts, tsx, js)               |
| `--filter <path>` | `-f`  | Filter by path or glob pattern (can be used multiple times)|
| `--help`          | `-h`  | Show help message                                          |

### Filtering by File Type

Use glob patterns with `--filter` to search specific file types:

```bash
# Search only source code files
raggrep query "service controller" --filter "*.ts"
raggrep query "component state" --filter "*.tsx"

# Search only documentation
raggrep query "deployment workflow" --filter "*.md"

# Search test files
raggrep query "mock setup" --filter "*.test.ts"

# Combine with path prefix
raggrep query "api handler" --filter "src/**/*.ts"
```

### Multiple Filters (OR Logic)

Use multiple `--filter` flags to match files that match **any** of the patterns:

```bash
# Search TypeScript OR TSX files
raggrep query "component" --filter "*.ts" --filter "*.tsx"

# Search in multiple directories
raggrep query "api" --filter src/api --filter src/routes

# Mix glob patterns and path prefixes
raggrep query "config" --filter "*.json" --filter "*.yaml" --filter config/
```

This is useful when you know whether you're looking for code or documentation.

### Index Options

```bash
raggrep index                        # Index current directory
raggrep index --watch                # Watch mode - re-index on file changes
raggrep index --verbose              # Show detailed progress
raggrep index --concurrency 8        # Set parallel workers (default: auto)
raggrep index --model bge-small-en-v1.5  # Use specific embedding model
```

| Flag                | Short | Description                                             |
| ------------------- | ----- | ------------------------------------------------------- |
| `--watch`           | `-w`  | Watch for file changes and re-index automatically       |
| `--verbose`         | `-v`  | Show detailed progress                                  |
| `--concurrency <n>` | `-c`  | Number of parallel workers (default: auto based on CPU) |
| `--model <name>`    | `-m`  | Embedding model to use                                  |
| `--help`            | `-h`  | Show help message                                       |

### Other Commands

```bash
raggrep status           # Show index status and statistics
raggrep reset            # Clear the index completely
raggrep --version        # Show version
```

## How It Works

1. **First query** — Creates the index (takes 1-2 min for ~1000 files)
2. **Subsequent queries** — Uses cached index (instant if no changes)
3. **Files changed** — Re-indexes only modified files automatically
4. **Files deleted** — Stale entries cleaned up automatically

The index is stored in a system temp directory, keeping your project clean.

## What Gets Indexed

### Supported Languages

**TypeScript/JavaScript** (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`)
- AST-parsed for functions, classes, interfaces, types, enums
- Full file chunks for broad context
- JSDoc and comment association

**Python** (`.py`)
- AST-parsed for functions, classes, decorators
- Docstring extraction and association
- Fallback regex parsing for robustness

**Go** (`.go`)
- AST-parsed for functions, methods, structs, interfaces
- Doc comment extraction (`//` style)
- Exported symbol detection

**Rust** (`.rs`)
- AST-parsed for functions, structs, traits, impls, enums
- Doc comment extraction (`///` and `//!` style)
- Visibility detection (`pub`)

**Markdown** (`.md`)
- Hierarchical chunking at multiple heading levels (H1-H5)
- Each heading level creates separate searchable chunks
- Nested content included for context

**JSON** (`.json`)
- Structure-aware with key/value extraction
- Path-based indexing

**Other formats:** `.yaml`, `.yml`, `.toml`, `.sql`, `.txt` — Keyword search and full-text indexing

### Automatically Ignored

`node_modules`, `dist`, `build`, `.git`, `.next`, `.cache`, `__pycache__`, `target`, and other common build/dependency directories

## OpenCode Integration

RAGgrep can be integrated with [OpenCode](https://opencode.ai) to provide semantic code search capabilities within the AI coding assistant.

### Installation

RAGgrep supports two installation types for OpenCode:

#### Default Installation (Recommended)
```bash
raggrep opencode install
```

This installs RAGgrep as a **tool** by default, which provides the best activation rates in OpenCode.

#### Explicit Installation Types

**Force Tool Installation:**
```bash
raggrep opencode install --tool
```
- Installs to: `~/.config/opencode/tool/raggrep.ts`
- Direct tool execution with full raggrep functionality

**Force Skill Installation:**
```bash
raggrep opencode install --skill
```
- Installs to: `~/.config/opencode/skill/raggrep/SKILL.md`
- Skill-based integration for modern OpenCode versions

#### Mutual Exclusivity

Installing one type will prompt to remove the other (default: yes):

```bash
# Installing skill will prompt to remove existing tool
raggrep opencode install --skill

# Installing tool will prompt to remove existing skill  
raggrep opencode install --tool
```

### Usage in OpenCode

#### Tool Usage
Once installed as a tool, RAGgrep provides direct search functionality:
- Natural language queries: "user authentication flow"
- All CLI options: `--top`, `--min-score`, `--type`, `--filter`
- Context-aware results with scores and file locations

#### Skill Usage
Load the skill in your OpenCode conversation:
```bash
skill({ name: "raggrep" })
```

Then follow the skill's guidance to:
1. Install RAGgrep: `npm install -g raggrep`
2. Index your codebase: `raggrep index`
3. Use semantic search: `raggrep query "your search term"`

### Why Tool by Default?

The tool installation is the default because it:
- Has higher activation rates in OpenCode agents
- Provides immediate search capabilities
- Works consistently across all OpenCode versions
- Offers direct integration without skill loading steps

The skill installation is available for users who prefer the modern skill-based approach or need specific skill integration features.

## Documentation

- [Getting Started](./docs/getting-started.md) — Installation options and first steps
- [CLI Reference](./docs/cli-reference.md) — All commands and options
- [SDK Reference](./docs/sdk.md) — Programmatic API for Node.js/Bun
- [Advanced](./docs/advanced.md) — Configuration, maintenance commands
- [Architecture](./docs/architecture.md) — How RAGgrep works internally

## Requirements

- Node.js 18+ or Bun 1.0+
- ~50MB disk space for models (cached at `~/.cache/raggrep/models/`)

## License

MIT
