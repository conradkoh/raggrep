# SDK Reference

RAGgrep can be used programmatically in Node.js or Bun applications.

## Installation

```bash
# With npm
npm install raggrep

# With Bun
bun add raggrep
```

## Quick Start

```typescript
import raggrep from "raggrep";

// Index a directory
await raggrep.index("./my-project");

// Search
const results = await raggrep.search("./my-project", "user authentication");
console.log(raggrep.formatSearchResults(results));
```

## API Reference

### `raggrep.index(directory, options?)`

Index a directory for semantic search.

```typescript
const results = await raggrep.index("./my-project", {
  model: "bge-small-en-v1.5", // Optional: embedding model
  verbose: true, // Optional: show progress
});

// Results per module
for (const result of results) {
  console.log(`${result.moduleId}: ${result.indexed} indexed`);
}
```

**Parameters:**

| Parameter         | Type      | Default              | Description                |
| ----------------- | --------- | -------------------- | -------------------------- |
| `directory`       | `string`  | required             | Path to directory to index |
| `options.model`   | `string`  | `"all-MiniLM-L6-v2"` | Embedding model to use     |
| `options.verbose` | `boolean` | `false`              | Show detailed progress     |

**Returns:** `Promise<IndexResult[]>`

```typescript
interface IndexResult {
  moduleId: string; // "core" | "language/typescript"
  indexed: number; // Files indexed
  skipped: number; // Files skipped (unchanged)
  errors: number; // Files with errors
}
```

### `raggrep.search(directory, query, options?)`

Search the indexed codebase.

```typescript
const results = await raggrep.search("./my-project", "user login", {
  topK: 5, // Number of results
  minScore: 0.2, // Minimum similarity (0-1)
  filePatterns: ["*.ts", "*.tsx"], // Filter by file type
});

for (const result of results) {
  console.log(`${result.filepath}:${result.chunk.startLine}`);
  console.log(`  Score: ${(result.score * 100).toFixed(1)}%`);
  console.log(`  ${result.chunk.content.slice(0, 100)}...`);
}
```

**Parameters:**

| Parameter              | Type       | Default  | Description                   |
| ---------------------- | ---------- | -------- | ----------------------------- |
| `directory`            | `string`   | required | Path to indexed directory     |
| `query`                | `string`   | required | Natural language search query |
| `options.topK`         | `number`   | `10`     | Number of results to return   |
| `options.minScore`     | `number`   | `0.15`   | Minimum similarity threshold  |
| `options.filePatterns` | `string[]` | all      | File patterns to filter       |

**Returns:** `Promise<SearchResult[]>`

```typescript
interface SearchResult {
  filepath: string; // Relative path to file
  chunk: Chunk; // Matched code chunk
  score: number; // Relevance score (0-1)
  moduleId: string; // Module that found this result
}

interface Chunk {
  id: string; // Unique chunk ID
  content: string; // Code content
  startLine: number; // Start line in file
  endLine: number; // End line in file
  type: string; // "function" | "class" | "interface" | etc.
  name?: string; // Symbol name if applicable
  isExported?: boolean; // Whether exported
}
```

### `raggrep.cleanup(directory, options?)`

Remove stale index entries for deleted files.

```typescript
const results = await raggrep.cleanup("./my-project", {
  verbose: true,
});

for (const result of results) {
  console.log(`${result.moduleId}: removed ${result.removed} entries`);
}
```

**Parameters:**

| Parameter         | Type      | Default  | Description               |
| ----------------- | --------- | -------- | ------------------------- |
| `directory`       | `string`  | required | Path to indexed directory |
| `options.verbose` | `boolean` | `false`  | Show detailed progress    |

**Returns:** `Promise<CleanupResult[]>`

```typescript
interface CleanupResult {
  moduleId: string;
  removed: number; // Stale entries removed
  kept: number; // Valid entries kept
}
```

### `raggrep.formatSearchResults(results)`

Format search results for display.

```typescript
const results = await raggrep.search("./my-project", "auth");
console.log(raggrep.formatSearchResults(results));
```

**Parameters:**

| Parameter | Type             | Description    |
| --------- | ---------------- | -------------- |
| `results` | `SearchResult[]` | Search results |

**Returns:** `string` — Formatted output for console

## Type Exports

All types are exported for TypeScript users:

```typescript
import type {
  IndexResult,
  IndexOptions,
  CleanupResult,
  SearchOptions,
  SearchResult,
  Chunk,
  FileIndex,
} from "raggrep";
```

## Examples

### Build a Code Search API

```typescript
import express from "express";
import raggrep from "raggrep";

const app = express();
const PROJECT_DIR = "./my-project";

// Index on startup
await raggrep.index(PROJECT_DIR);

app.get("/search", async (req, res) => {
  const query = req.query.q as string;
  const results = await raggrep.search(PROJECT_DIR, query, { topK: 20 });
  res.json(results);
});

app.listen(3000);
```

### Pre-commit Hook

```typescript
// scripts/pre-commit-index.ts
import raggrep from "raggrep";

const results = await raggrep.index(".", { verbose: false });
const totalIndexed = results.reduce((sum, r) => sum + r.indexed, 0);

if (totalIndexed > 0) {
  console.log(`Re-indexed ${totalIndexed} changed files`);
}
```

### Custom Search UI

```typescript
import raggrep from "raggrep";

async function searchCode(query: string) {
  const results = await raggrep.search(".", query, {
    topK: 10,
    minScore: 0.15,
  });

  return results.map((r) => ({
    file: r.filepath,
    line: r.chunk.startLine,
    name: r.chunk.name,
    type: r.chunk.type,
    score: Math.round(r.score * 100),
    preview: r.chunk.content.split("\n").slice(0, 3).join("\n"),
  }));
}
```

## Notes

- The SDK uses the same indexing logic as the CLI
- Index is stored in a system temp directory (not in your project)
- First search may take longer as the index is created
- Subsequent searches are fast if files haven't changed

