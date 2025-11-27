# CLI Reference

## Commands

### `raggrep index`

Index the current directory for semantic search.

```bash
raggrep index [options]
```

**Options:**

| Flag | Short | Description |
|------|-------|-------------|
| `--model <name>` | `-m` | Embedding model to use (default: `all-MiniLM-L6-v2`) |
| `--verbose` | `-v` | Show detailed progress for each file |
| `--help` | `-h` | Show help message |

**Available Models:**

| Model | Description |
|-------|-------------|
| `all-MiniLM-L6-v2` | Default. Good balance of speed and quality (~23MB) |
| `all-MiniLM-L12-v2` | Higher quality, slightly slower |
| `bge-small-en-v1.5` | Good for code |
| `paraphrase-MiniLM-L3-v2` | Smallest/fastest option |

**Examples:**

```bash
# Basic indexing
raggrep index

# Use a different model
raggrep index --model bge-small-en-v1.5

# Show detailed progress
raggrep index --verbose

# Combine options
raggrep index -m bge-small-en-v1.5 -v
```

**Notes:**
- On first run, the embedding model is downloaded and cached at `~/.cache/raggrep/models/`
- Incremental indexing: unchanged files are automatically skipped
- Index is stored in `.raggrep/` directory in your project

---

### `raggrep query`

Search the indexed codebase using natural language.

```bash
raggrep query <search query> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<search query>` | Natural language search query (required) |

**Options:**

| Flag | Short | Description |
|------|-------|-------------|
| `--top <n>` | `-k` | Number of results to return (default: 10) |
| `--min-score <n>` | `-s` | Minimum similarity score threshold 0-1 (default: 0.15). Lower values return more results. |
| `--type <ext>` | `-t` | Filter results by file extension (e.g., ts, tsx, js) |
| `--help` | `-h` | Show help message |

**Examples:**

```bash
# Basic search
raggrep query "user authentication"

# Limit results
raggrep query "handle errors" --top 5

# Search with lower threshold (find more results)
raggrep query "database" --min-score 0.1

# Filter by file type
raggrep query "interface" --type ts

# Combine options
raggrep query "user" --type tsx --top 5
```

**Output Format:**

Results are sorted by relevance score and include:
- File path and line numbers
- Relevance score (percentage)
- Code type (function, class, file, etc.)
- Preview of the matching code

---

### `raggrep cleanup`

Remove stale index entries for files that have been deleted.

```bash
raggrep cleanup [options]
```

**Options:**

| Flag | Short | Description |
|------|-------|-------------|
| `--verbose` | `-v` | Show detailed progress |
| `--help` | `-h` | Show help message |

**Examples:**

```bash
# Clean up stale index entries
raggrep cleanup

# Show detailed progress
raggrep cleanup --verbose
```

**Notes:**
- Removes index entries for files that no longer exist
- Cleans up empty directories in the index
- Run this after deleting files from your project

---

### `raggrep --version`

Show the current version of raggrep.

```bash
raggrep --version
raggrep -v
```

**Example Output:**

```
raggrep v0.1.0
```

---

### `raggrep --help`

Show general help and available commands.

```bash
raggrep --help
raggrep -h
```

## Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | Error (invalid arguments, indexing failed, etc.) |

## Environment

**Model Cache Location:**
```
~/.cache/raggrep/models/
```

**Index Location:**
```
<project-root>/.raggrep/
```
