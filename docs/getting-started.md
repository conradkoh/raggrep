# Getting Started

## Installation

### Option 1: Global Install (Recommended)

```bash
# With npm
npm install -g raggrep

# Or with Bun
bun install -g raggrep
```

After installation, the `raggrep` command is available globally.

### Option 2: Use Without Installing

```bash
npx raggrep query "user login"
```

### Option 3: From Source

```bash
git clone https://github.com/conradkoh/raggrep.git
cd raggrep
bun install
bun run build
npm link
```

## Requirements

- **Node.js 18+** or **Bun 1.0+**
- ~50MB disk space for embedding models (cached globally at `~/.cache/raggrep/models/`)

## Your First Search

1. **Navigate to your project:**

   ```bash
   cd your-project
   ```

2. **Search your code:**

   ```bash
   raggrep query "handle user login"
   ```

That's it! The index is created automatically on first query. On first run, the embedding model (~23MB) will be downloaded and cached.

## Example Output

```
Index updated: 42 indexed

RAGgrep Search
==============

Searching for: "handle user login"

Found 4 results:

1. src/auth/authService.ts:24-55 (login)
   Score: 34.4% | Type: function | via TypeScript | exported
      export async function login(credentials: LoginCredentials): Promise<AuthResult> {
        const { email, password } = credentials;

2. src/auth/session.ts:10-25 (createSession)
   Score: 28.2% | Type: function | via TypeScript | exported
      export function createSession(user: User): Session {

3. src/users/types.ts:3-12 (User)
   Score: 29.8% | Type: interface | via TypeScript | exported
      export interface User {
        id: string;
        email: string;
```

Results include:

- **File path and line numbers** — Where the code is located
- **Name** — The function/class/interface name
- **Score** — Relevance percentage (higher is better)
- **Type** — Code construct type (function, interface, class, etc.)
- **Module** — Which index module found the result (TypeScript, Core)
- **Export status** — Whether the code is exported
- **Preview** — First few lines of the matching code

## How It Works

RAGgrep manages the index automatically like a cache:

| Scenario             | What Happens                             |
| -------------------- | ---------------------------------------- |
| First query          | Creates full index, then searches        |
| No changes           | Uses cached index (instant)              |
| Files modified       | Re-indexes changed files, then searches  |
| Files deleted        | Removes stale entries, then searches     |

You never need to manually index unless you want watch mode.

## Watch Mode

For active development, keep the index fresh in real-time:

```bash
raggrep index --watch
```

This monitors file changes and re-indexes automatically:

```
┌─────────────────────────────────────────┐
│  Watching for changes... (Ctrl+C to stop) │
└─────────────────────────────────────────┘

[Watch] language/typescript: 2 indexed, 0 errors
```

## What Gets Indexed

### File Types (default)

| Extension     | Language   |
| ------------- | ---------- |
| `.ts`, `.tsx` | TypeScript |
| `.js`, `.jsx` | JavaScript |
| `.py`         | Python     |
| `.go`         | Go         |
| `.rs`         | Rust       |
| `.java`       | Java       |
| `.md`, `.txt` | Text       |

### Code Structures

For TypeScript/JavaScript files, RAGgrep uses AST-based parsing to extract:

| Structure    | Examples                                                        |
| ------------ | --------------------------------------------------------------- |
| Functions    | `function foo()`, `async function bar()`, `const fn = () => {}` |
| Classes      | `class User`, `abstract class Base`                             |
| Interfaces   | `interface UserProps`                                           |
| Type aliases | `type ID = string`                                              |
| Enums        | `enum Status`, `const enum Direction`                           |
| Variables    | `export const CONFIG = {}`                                      |

For other languages, content is chunked by blocks or as whole files.

### Ignored Directories

These directories are automatically skipped:

| Category      | Directories                                        |
| ------------- | -------------------------------------------------- |
| Dependencies  | `node_modules`, `.pnpm-store`, `.yarn`, `vendor`   |
| Build outputs | `dist`, `build`, `out`, `target`, `.next`, `.nuxt` |
| Caches        | `.cache`, `.turbo`, `.parcel-cache`, `coverage`    |
| Python        | `__pycache__`, `.venv`, `venv`                     |
| Other         | `.git`, `.idea`                                    |

See [Advanced](./advanced.md) to customize.

## Index Storage

The index is stored in a **system temp directory** to keep your project clean:

```
# macOS/Linux
/tmp/raggrep-indexes/<project-hash>/

# Windows
%TEMP%\raggrep-indexes\<project-hash>\
```

Use `raggrep status` to see the exact location for your project.

## Next Steps

- [CLI Reference](./cli-reference.md) — All commands and options
- [SDK Reference](./sdk.md) — Use RAGgrep programmatically
- [Advanced](./advanced.md) — Configuration and maintenance
- [Architecture](./architecture.md) — How RAGgrep works internally
