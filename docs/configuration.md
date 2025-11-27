# Configuration

RAGgrep works out of the box with sensible defaults, but can be customized via a configuration file.

## Configuration File

Create `.raggrep/config.json` in your project root to customize behavior:

```json
{
  "version": "0.1.0",
  "indexDir": ".raggrep",
  "extensions": [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".md"],
  "ignorePaths": ["node_modules", ".git", "dist", "build", ".raggrep"],
  "modules": [
    {
      "id": "semantic",
      "enabled": true,
      "options": {
        "embeddingModel": "all-MiniLM-L6-v2"
      }
    }
  ]
}
```

## Configuration Options

### `version`

Schema version for the configuration file.

**Default:** `"0.1.0"`

### `indexDir`

Directory name for storing index data (relative to project root).

**Default:** `".raggrep"`

### `extensions`

Array of file extensions to index.

**Default:**
```json
[".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".md"]
```

**Example - TypeScript only:**
```json
{
  "extensions": [".ts", ".tsx"]
}
```

### `ignorePaths`

Array of directory/file names to ignore during indexing.

**Default:**
```json
[
  "node_modules", ".pnpm-store", ".yarn", "vendor",
  ".git",
  "dist", "build", "out", ".output", "target",
  ".next", ".nuxt", ".svelte-kit", ".vercel", ".netlify",
  ".cache", ".turbo", ".parcel-cache", ".eslintcache",
  "coverage", ".nyc_output",
  "__pycache__", ".venv", "venv", ".pytest_cache",
  ".idea",
  ".raggrep"
]
```

**Example - Add additional ignores:**
```json
{
  "ignorePaths": ["node_modules", ".git", "dist", "build", ".raggrep", "__tests__", "*.test.ts"]
}
```

### `modules`

Array of module configurations.

**Structure:**
```json
{
  "modules": [
    {
      "id": "semantic",
      "enabled": true,
      "options": {
        // Module-specific options
      }
    }
  ]
}
```

## Module Options

### Semantic Module

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `embeddingModel` | string | `"all-MiniLM-L6-v2"` | Embedding model to use |

### Search Defaults

| Setting | Default | Description |
|---------|---------|-------------|
| `topK` | `10` | Number of results to return |
| `minScore` | `0.15` | Minimum similarity threshold (0-1). Lower values return more results but may include less relevant matches. |

**Available Models:**

| Model | Size | Dimensions | Notes |
|-------|------|------------|-------|
| `all-MiniLM-L6-v2` | ~23MB | 384 | Default, good balance |
| `all-MiniLM-L12-v2` | ~33MB | 384 | Higher quality |
| `bge-small-en-v1.5` | ~33MB | 384 | Good for code |
| `paraphrase-MiniLM-L3-v2` | ~17MB | 384 | Fastest |

**Example - Use BGE model:**
```json
{
  "modules": [
    {
      "id": "semantic",
      "enabled": true,
      "options": {
        "embeddingModel": "bge-small-en-v1.5"
      }
    }
  ]
}
```

## CLI Overrides

Some configuration options can be overridden via CLI flags:

| Config Option | CLI Flag | Example |
|---------------|----------|---------|
| `modules[semantic].options.embeddingModel` | `--model`, `-m` | `raggrep index --model bge-small-en-v1.5` |

CLI flags take precedence over configuration file settings.

## Environment

### Model Cache

Embedding models are cached globally at:
```
~/.cache/raggrep/models/
```

This directory is shared across all projects to avoid re-downloading models.

### Index Storage

Each project's index is stored at:
```
<project-root>/.raggrep/
```

This directory should be added to `.gitignore`:
```gitignore
.raggrep/
```

## Example Configurations

### Minimal (TypeScript Project)

```json
{
  "extensions": [".ts", ".tsx"],
  "ignorePaths": ["node_modules", ".git", "dist", ".raggrep"]
}
```

### Python Project

```json
{
  "extensions": [".py"],
  "ignorePaths": ["__pycache__", ".git", "venv", ".raggrep", ".pytest_cache"]
}
```

### Monorepo

```json
{
  "extensions": [".ts", ".tsx", ".js", ".jsx"],
  "ignorePaths": [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".raggrep",
    "**/node_modules",
    "**/dist"
  ]
}
```

### High-Quality Search

```json
{
  "modules": [
    {
      "id": "semantic",
      "enabled": true,
      "options": {
        "embeddingModel": "all-MiniLM-L12-v2"
      }
    }
  ]
}
```
