# Getting Started

## Installation

### Option 1: Global Install (Recommended)

```bash
# With npm
npm install -g raggrep

# Or with Bun (recommended)
bun install -g raggrep
```

After installation, the `raggrep` command is available globally.

### Option 2: Use Without Installing

```bash
npx raggrep index
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

### Option 4: Programmatic Use

```bash
# With npm
npm install raggrep

# Or with Bun
bun add raggrep
```

```typescript
import raggrep from "raggrep";

await raggrep.index("./my-project");
const results = await raggrep.search("./my-project", "user authentication");
```

## Requirements

- **Node.js 18+** or **Bun 1.0+**
- ~50MB disk space for embedding models (cached globally at `~/.cache/raggrep/models/`)

## First Run

1. **Navigate to your project:**

   ```bash
   cd your-project
   ```

2. **Index your codebase:**

   ```bash
   raggrep index
   ```

   On first run, the embedding model (~23MB) will be downloaded and cached.

3. **Search your code:**
   ```bash
   raggrep query "handle user login"
   ```

## Example Output

```
RAGgrep Search
==============

Searching for: "handle user login"

Found 4 results:

1. src/auth/authService.ts:24-55 (login)
   Score: 34.4% | Type: function | exported
      export async function login(credentials: LoginCredentials): Promise<AuthResult> ...
        const { email, password } = credentials;

2. src/users/types.ts:3-12 (User)
   Score: 29.8% | Type: interface | exported
      export interface User {
        id: string;
        email: string;
```

Results include:

- **File path and line numbers** — Where the code is located
- **Name** — The function/class/interface name
- **Score** — Relevance percentage (higher is better)
- **Type** — Code construct type (function, interface, class, etc.)
- **Export status** — Whether the code is exported
- **Preview** — First few lines of the matching code

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
| `.md`         | Markdown   |

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
| Other         | `.git`, `.idea`, `.raggrep`                        |

See [Configuration](./configuration.md) to customize.

## How It Scales

RAGgrep uses a tiered index system designed for large codebases:

### Symbolic Index (Fast Filtering)

- Lightweight file summaries with extracted keywords
- Persisted BM25 index for keyword matching
- Stored as individual JSON files per source file

### Embedding Index (Semantic Search)

- Full chunk embeddings for semantic similarity
- Only loaded for files that pass keyword filtering
- Keeps memory usage low

**Result:** Search performance depends on the number of _relevant_ files, not total codebase size.

## Index Storage

The index is stored in `.raggrep/` in your project root:

```
your-project/
├── .raggrep/
│   ├── config.json              # Optional configuration
│   ├── manifest.json            # Global manifest
│   └── index/
│       ├── core/                # Core module index
│       │   ├── manifest.json
│       │   ├── symbols.json     # Symbol + BM25 index
│       │   └── src/...          # Per-file chunks
│       └── language/
│           └── typescript/
│               ├── manifest.json
│               ├── symbolic/    # Keyword index (BM25)
│               │   ├── _meta.json
│               │   └── src/...
│               └── src/         # Embedding index
│                   └── ...
├── src/
└── ...
```

Add `.raggrep/` to your `.gitignore`:

```gitignore
.raggrep/
```

## Next Steps

- [CLI Reference](./cli-reference.md) — All commands and options
- [Configuration](./configuration.md) — Customize indexing behavior
- [Architecture](./architecture.md) — How RAGgrep works internally
