# RAGgrep

**Local semantic search for codebases** — find code using natural language queries.

RAGgrep indexes your code and lets you search it using natural language. Everything runs locally — no external API calls required.

## Features

- **Zero-config search** — Just run `raggrep query` and it works. Index is created and updated automatically.
- **Local-first** — All indexing and search happens on your machine. No cloud dependencies.
- **Incremental** — Only re-indexes files that have changed. Instant search when nothing changed.
- **Watch mode** — Keep the index fresh in real-time as you code.
- **Hybrid search** — Combines semantic similarity with keyword matching for best results.

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

## CLI Quick Reference

```bash
# Search (auto-indexes if needed)
raggrep query "user login"
raggrep query "error handling" --top 5
raggrep query "database" --type ts

# Watch mode
raggrep index --watch

# Check index status
raggrep status
```

## How It Works

1. **First query** — Creates the index (takes 1-2 min for ~1000 files)
2. **Subsequent queries** — Uses cached index (instant if no changes)
3. **Files changed** — Re-indexes only modified files automatically
4. **Files deleted** — Stale entries cleaned up automatically

The index is stored in a system temp directory, keeping your project clean.

## What Gets Indexed

**File types:** `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`, `.rs`, `.java`, `.md`, `.txt`

**Code structures:** Functions, classes, interfaces, types, enums, exports

**Automatically ignored:** `node_modules`, `dist`, `build`, `.git`, and other common directories

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
