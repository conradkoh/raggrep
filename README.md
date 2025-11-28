# RAGgrep

**Local filesystem-based RAG system for codebases** — semantic search using local embeddings.

RAGgrep indexes your code and allows semantic search using natural language queries. Everything runs locally on your machine — no external API calls required.

## Features

- **🏠 Local-first** — All indexing and search happens locally. No cloud dependencies.
- **📁 Filesystem-based** — Index stored as readable JSON files in system temp directory.
- **⚡ Tiered search** — Fast keyword filtering + semantic search for efficiency.
- **🔍 Hybrid scoring** — Combines semantic similarity with BM25 keyword matching.
- **🔄 Incremental** — Only re-indexes files that have changed.
- **📝 TypeScript-optimized** — AST-based parsing extracts functions, classes, interfaces, types.
- **🎯 Zero config** — Works out of the box with sensible defaults.

## Installation

```bash
# Install globally with npm
npm install -g raggrep

# Or with Bun (recommended)
bun install -g raggrep

# Or use without installing
npx raggrep --help
```

## Quick Start

```bash
# Index your project
cd your-project
raggrep index

# Search your codebase
raggrep query "user authentication"
```

### Example Output

```
Found 3 results:

1. src/auth/authService.ts:24-55 (login)
   Score: 34.4% | Type: function | exported
      export async function login(credentials: LoginCredentials): Promise<AuthResult> ...

2. src/auth/authService.ts:60-62 (logout)
   Score: 27.5% | Type: function | exported
      export async function logout(token: string): Promise<void> {

3. src/users/types.ts:3-12 (User)
   Score: 26.0% | Type: interface | exported
      export interface User {
        id: string;
```

## Programmatic API

```typescript
import raggrep from "raggrep";

// Index a directory
await raggrep.index("./my-project");

// Search
const results = await raggrep.search("./my-project", "user authentication");
console.log(raggrep.formatSearchResults(results));

// Cleanup stale entries
await raggrep.cleanup("./my-project");
```

## CLI Reference

```bash
# Index commands
raggrep index                              # Index current directory
raggrep index --watch                      # Watch mode: re-index on file changes
raggrep index --model bge-small-en-v1.5    # Use different embedding model
raggrep index --verbose                    # Show detailed progress

# Search commands
raggrep query "user login"                 # Basic search
raggrep query "error handling" --top 5     # Limit results
raggrep query "database" --min-score 0.1   # Lower threshold (more results)
raggrep query "interface" --type ts        # Filter by file type

# Maintenance
raggrep cleanup                            # Remove stale index entries
raggrep status                             # Show index status
```

## How It Works

RAGgrep uses a **dual-module architecture** with two complementary index types:

### Core Module

- **Language-agnostic** regex-based symbol extraction
- **BM25 keyword matching** for fast, deterministic search
- Works on any text file

### TypeScript Module

- **AST-based parsing** via TypeScript Compiler API
- **Semantic embeddings** for natural language understanding
- **Symbolic index** for fast BM25 candidate filtering

Search combines results from both modules:

```
Query → Core (symbol/BM25) ─┐
                           ├→ Merge & rank → Results
Query → TypeScript (BM25 filter → semantic) ─┘
```

## What Gets Indexed

**File types:** `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`, `.rs`, `.java`, `.md`

**Code structures:**

- Functions (regular, async, arrow)
- Classes (including abstract)
- Interfaces
- Type aliases
- Enums
- Exported variables

**Automatically ignored:**

- `node_modules`, `dist`, `build`, `.git`
- `.next`, `.nuxt`, `__pycache__`, `venv`
- See [Configuration](./docs/configuration.md) for full list

## Documentation

- [Getting Started](./docs/getting-started.md) — Installation and first steps
- [CLI Reference](./docs/cli-reference.md) — All commands and options
- [Configuration](./docs/configuration.md) — Customize indexing behavior
- [Architecture](./docs/architecture.md) — How RAGgrep works internally

## Performance

| Operation                | Time       | Notes                                  |
| ------------------------ | ---------- | -------------------------------------- |
| Initial index (1k files) | 1-2 min    | Embedding generation is the bottleneck |
| Incremental update       | <2s        | Only changed files                     |
| Search                   | ~100-500ms | Depends on codebase size               |

## Requirements

- Node.js 18+ or Bun 1.0+
- ~50MB disk space for models (cached globally at `~/.cache/raggrep/models/`)

## License

MIT
