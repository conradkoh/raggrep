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

Results now include:
- **Name** - The function/class/interface name in parentheses
- **Type** - The kind of code construct (function, interface, type, etc.)
- **Export status** - Whether the code is exported

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
