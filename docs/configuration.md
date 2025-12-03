# Configuration

RAGgrep works out of the box with sensible defaults. Configuration is optional.

> **Note:** For detailed maintenance commands and advanced options, see [Advanced](./advanced.md).

## Default Behavior

Without any configuration, RAGgrep:

- **Indexes:** `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`, `.rs`, `.java`, `.md`, `.txt`
- **Ignores:** `node_modules`, `dist`, `build`, `.git`, `.next`, `.nuxt`, `__pycache__`, `venv`, etc.
- **Uses model:** `bge-small-en-v1.5` (~33MB, 384 dimensions)

## Quick Configuration

### Change Embedding Model

```bash
raggrep index --model nomic-embed-text-v1.5
```

Available models:

| Model                     | Dimensions | Size   | Notes                              |
| ------------------------- | ---------- | ------ | ---------------------------------- |
| `bge-small-en-v1.5`       | 384        | ~33MB  | **Default**, best balance for code |
| `nomic-embed-text-v1.5`   | 768        | ~270MB | Higher quality, larger             |
| `all-MiniLM-L6-v2`        | 384        | ~23MB  | Fast, good general purpose         |
| `all-MiniLM-L12-v2`       | 384        | ~33MB  | Higher quality than L6             |
| `paraphrase-MiniLM-L3-v2` | 384        | ~17MB  | Fastest, lower quality             |

### Configuration File

The config file is stored in the index directory:

```bash
# Find your index location
raggrep status

# Edit config at: <index-location>/config.json
```

Example configuration:

```json
{
  "extensions": [".ts", ".tsx"],
  "ignorePaths": ["node_modules", ".git", "dist", "build", "__tests__"],
  "modules": [
    { "id": "core", "enabled": true },
    {
      "id": "language/typescript",
      "enabled": true,
      "options": { "embeddingModel": "bge-small-en-v1.5" }
    }
  ]
}
```

## Configuration Options

### `extensions`

File extensions to index.

```json
{ "extensions": [".ts", ".tsx"] }
```

### `ignorePaths`

Directories to skip.

```json
{ "ignorePaths": ["node_modules", ".git", "dist", "__tests__"] }
```

### `modules`

Enable/disable modules or change settings.

```json
{
  "modules": [
    { "id": "core", "enabled": true },
    {
      "id": "language/typescript",
      "enabled": true,
      "options": { "embeddingModel": "bge-small-en-v1.5" }
    }
  ]
}
```

## Default Ignored Paths

```
node_modules, .pnpm-store, .yarn, vendor
.git
dist, build, out, .output, target
.next, .nuxt, .svelte-kit, .vercel, .netlify
.cache, .turbo, .parcel-cache, .eslintcache
coverage, .nyc_output
__pycache__, .venv, venv, .pytest_cache
.idea
```

## Environment

### Model Cache

Embedding models are cached globally:

```
~/.cache/raggrep/models/
```

### Index Location

Index is stored in system temp:

```
/tmp/raggrep-indexes/<project-hash>/
```

Use `raggrep status` to see the exact location.

---

For more advanced configuration and maintenance commands, see [Advanced](./advanced.md).
