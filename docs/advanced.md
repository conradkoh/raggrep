# Advanced Usage

This document covers maintenance commands, configuration options, and advanced features.

## Maintenance Commands

### `raggrep status`

Check the current state of your index.

```bash
raggrep status
```

**Example output (indexed):**

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

**Example output (not indexed):**

```
┌─────────────────────────────────────────┐
│  RAGgrep Status                         │
├─────────────────────────────────────────┤
│  ○ Not indexed                          │
└─────────────────────────────────────────┘

  Directory: /Users/you/project

  Run "raggrep query" to create an index.
```

### `raggrep reset`

Clear the index for the current directory.

```bash
raggrep reset
```

This completely removes the index. The next `raggrep index` or `raggrep query` will rebuild from scratch.

### `raggrep index`

Explicitly index the directory. Usually not needed since `raggrep query` auto-indexes.

```bash
raggrep index             # Index current directory
raggrep index --verbose   # Show detailed progress
raggrep index --model nomic-embed-text-v1.5  # Use different model
raggrep index --concurrency 8  # Set parallel workers
```

## Configuration

RAGgrep works out of the box with sensible defaults. Configuration is optional.

### Configuration File

The config file is stored in the index directory (system temp). You can modify it using any text editor:

```bash
# Find your index location
raggrep status
# Then edit: <index-location>/config.json
```

### Default Configuration

```json
{
  "version": "0.1.0",
  "extensions": [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".go",
    ".rs",
    ".java",
    ".md",
    ".txt"
  ],
  "ignorePaths": [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "__pycache__",
    "venv",
    ".venv",
    "coverage",
    ".cache"
  ],
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

### Configuration Options

#### `extensions`

File extensions to index.

```json
{
  "extensions": [".ts", ".tsx"] // TypeScript only
}
```

#### `ignorePaths`

Directories to skip during indexing.

```json
{
  "ignorePaths": [
    "node_modules",
    ".git",
    "dist",
    "build",
    "__tests__", // Add your own
    "generated" // Add your own
  ]
}
```

#### `modules`

Enable/disable index modules or change their settings.

```json
{
  "modules": [
    { "id": "core", "enabled": false }, // Disable core module
    {
      "id": "language/typescript",
      "enabled": true,
      "options": {
        "embeddingModel": "nomic-embed-text-v1.5" // Different model
      }
    }
  ]
}
```

### Available Embedding Models

| Model                     | Dimensions | Size   | Notes                              |
| ------------------------- | ---------- | ------ | ---------------------------------- |
| `bge-small-en-v1.5`       | 384        | ~33MB  | **Default**, best balance for code |
| `nomic-embed-text-v1.5`   | 768        | ~270MB | Higher quality, larger             |
| `all-MiniLM-L6-v2`        | 384        | ~23MB  | Fast, good general purpose         |
| `all-MiniLM-L12-v2`       | 384        | ~33MB  | Higher quality than L6             |
| `paraphrase-MiniLM-L3-v2` | 384        | ~17MB  | Fastest, lower quality             |

Override via CLI:

```bash
raggrep index --model nomic-embed-text-v1.5
```

## Index Storage

The index is stored in a **system temp directory** to keep your project clean:

```
# macOS/Linux
/tmp/raggrep-indexes/<project-hash>/

# Windows
%TEMP%\raggrep-indexes\<project-hash>\
```

The `<project-hash>` is derived from your project's absolute path, ensuring each project has its own isolated index.

### Index Structure

```
<temp>/raggrep-indexes/<hash>/
├── config.json              # Configuration
├── manifest.json            # Global manifest
└── index/
    ├── core/                # Core module (symbols + BM25)
    │   ├── manifest.json
    │   └── src/...
    └── language/
        └── typescript/      # TypeScript module (embeddings)
            ├── manifest.json
            ├── symbolic/    # Keyword index
            └── src/...      # Full embeddings
```

### Version Compatibility

RAGgrep automatically detects incompatible indexes from older versions and rebuilds them. You'll see:

```
Index version incompatible. Rebuilding...
```

The current index schema version is `1.1.0`.

## Search Options

### Limit Results

```bash
raggrep query "user" --top 5    # Return 5 results (default: 10)
```

### Adjust Sensitivity

```bash
raggrep query "user" --min-score 0.1   # Lower threshold, more results
raggrep query "user" --min-score 0.3   # Higher threshold, fewer results
```

Default is `0.15`. Lower values return more (potentially less relevant) results.

### Filter by File Type

```bash
raggrep query "interface" --type ts    # Only .ts files
raggrep query "component" --type tsx   # Only .tsx files
```

### Filter by Path or Glob Pattern

```bash
# Filter by path prefix
raggrep query "login" --filter src/auth           # Only src/auth/
raggrep query "api" --filter src/api --filter src/routes  # Multiple paths

# Filter by file type (glob patterns)
raggrep query "service controller" --filter "*.ts"   # Only TypeScript files
raggrep query "deployment workflow" --filter "*.md"  # Only Markdown files
raggrep query "mock setup" --filter "*.test.ts"      # Only test files

# Multiple filters (OR logic) - matches ANY of the patterns
raggrep query "component" --filter "*.ts" --filter "*.tsx"  # .ts OR .tsx
raggrep query "config" --filter "*.json" --filter "*.yaml"  # JSON OR YAML
```

## How Auto-Indexing Works

The `raggrep query` command manages the index automatically:

| Scenario                 | What Happens                            |
| ------------------------ | --------------------------------------- |
| No index exists          | Creates full index, then searches       |
| Index exists, no changes | Uses cached index (instant)             |
| Files modified           | Re-indexes changed files, then searches |
| Files deleted            | Removes stale entries, then searches    |
| Incompatible version     | Rebuilds entire index, then searches    |

This means you never need to run `raggrep index` manually unless you want watch mode or verbose output.

## Model Cache

Embedding models are cached globally:

```
~/.cache/raggrep/models/
```

This is shared across all projects. Delete to re-download models:

```bash
rm -rf ~/.cache/raggrep/models
```

## Performance Tips

### For Large Codebases

1. **Use watch mode** during development:

   ```bash
   raggrep index --watch
   ```

2. **Limit file types** to what matters:

   ```json
   { "extensions": [".ts", ".tsx"] }
   ```

3. **Ignore test/generated files**:

   ```json
   { "ignorePaths": ["__tests__", "generated", "*.test.ts"] }
   ```

4. **Increase concurrency** on machines with many cores:

   ```bash
   raggrep index --concurrency 16
   ```

### Expected Performance

| Operation                | Time       | Notes                    |
| ------------------------ | ---------- | ------------------------ |
| Initial index (1k files) | 1-2 min    | Embedding generation     |
| Incremental update       | <2s        | Only changed files       |
| Search (cached)          | ~100-500ms | Depends on codebase size |
| Search (with updates)    | +1-2s      | Per changed file         |
