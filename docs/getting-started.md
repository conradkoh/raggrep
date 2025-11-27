# Getting Started

## Prerequisites

- [Bun](https://bun.sh/) runtime (v1.0 or later)

## Installation

### From Source

```bash
git clone https://github.com/your-repo/raggrep.git
cd raggrep
bun install
bun link
```

After linking, the `raggrep` command will be available globally (ensure `~/.bun/bin` is in your PATH).

### Running Directly

You can also run raggrep directly without installing:

```bash
bun /path/to/raggrep/src/cli/main.ts index
bun /path/to/raggrep/src/cli/main.ts query "your search"
```

## First Run

1. Navigate to your project directory:
   ```bash
   cd your-project
   ```

2. Index your codebase:
   ```bash
   raggrep index
   ```
   
   On first run, the embedding model (~23MB) will be automatically downloaded and cached at `~/.cache/raggrep/models/`.

3. Search your code:
   ```bash
   raggrep query "handle user login"
   ```

## Example Output

```
RAGgrep Search
==============

Searching for: "handle user login"

Found 4 results:

1. src/auth/authService.ts:24-55
   Score: 34.4% | Module: semantic
   Type: function
   Preview:
      export async function login(credentials: LoginCredentials): Promise<AuthResult> ...

2. src/users/types.ts:1-29
   Score: 29.8% | Module: semantic
   Type: file
   Preview:
      // User types and interfaces
      export interface User {
```

## What Gets Indexed

By default, raggrep indexes these file types:
- TypeScript: `.ts`, `.tsx`
- JavaScript: `.js`, `.jsx`
- Python: `.py`
- Go: `.go`
- Rust: `.rs`
- Java: `.java`
- Markdown: `.md`

The following directories are automatically ignored:
- `node_modules`
- `.git`
- `dist`
- `build`
- `.raggrep`

## Next Steps

- See [CLI Reference](./cli-reference.md) for all available commands and options
- See [Configuration](./configuration.md) to customize indexing behavior
- See [Architecture](./architecture.md) to understand how raggrep works
