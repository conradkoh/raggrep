# Architecture

## Overview

RAGgrep uses a modular architecture that separates indexing, storage, and search concerns. This allows for extensibility and the ability to add new index types in the future.

```
┌─────────────────────────────────────────────────────────────┐
│                          CLI                                │
│                    (src/cli/main.ts)                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
┌─────────────────┐      ┌─────────────────┐
│    Indexer      │      │     Search      │
│ (src/indexer)   │      │  (src/search)   │
└────────┬────────┘      └────────┬────────┘
         │                        │
         └───────────┬────────────┘
                     ▼
         ┌─────────────────────┐
         │   Module Registry   │
         │ (src/modules)       │
         └──────────┬──────────┘
                    │
         ┌──────────┴──────────┐
         ▼                     ▼
┌─────────────────┐   ┌─────────────────┐
│ Semantic Module │   │  Future Modules │
│ (embeddings)    │   │  (LSP, AST...)  │
└─────────────────┘   └─────────────────┘
```

## Core Components

### CLI (`src/cli/`)

The command-line interface provides two main commands:
- `index` - Triggers the indexing process
- `query` - Performs semantic search

**Files:**
- `main.ts` - Entry point, argument parsing, command routing
- `index.ts` - Standalone index command (legacy)
- `query.ts` - Standalone query command (legacy)

### Indexer (`src/indexer/`)

Coordinates the indexing process across all enabled modules.

**Responsibilities:**
- Find files matching configured extensions
- Filter out ignored paths
- Delegate indexing to each enabled module
- Track file modification times for incremental updates
- Write index data to `.raggrep/` directory

**Key Functions:**
- `indexDirectory(rootDir, options)` - Main entry point

### Search (`src/search/`)

Handles query processing and result aggregation.

**Responsibilities:**
- Load query embedding
- Search across all module indexes
- Aggregate and rank results
- Format output

**Key Functions:**
- `search(rootDir, query, options)` - Main search function
- `formatSearchResults(results)` - Format results for display

### Modules (`src/modules/`)

Pluggable index modules that implement the `IndexModule` interface.

**Current Modules:**
- `semantic` - Text embeddings using Transformers.js

**Module Interface:**
```typescript
interface IndexModule {
  id: string;
  name: string;
  description: string;
  version: string;
  
  initialize?(config: ModuleConfig): Promise<void>;
  indexFile(filepath: string, content: string, ctx: IndexContext): Promise<FileIndex | null>;
  search(query: string, ctx: SearchContext, options: SearchOptions): Promise<SearchResult[]>;
}
```

### Utilities (`src/utils/`)

Shared utilities used across the codebase.

**Files:**
- `config.ts` - Configuration loading and path utilities
- `embeddings.ts` - Local embedding provider using Transformers.js

## Data Flow

### Indexing Flow

```
1. CLI parses arguments
2. Indexer loads config from .raggrep/config.json (or uses defaults)
3. Indexer finds all matching files (respecting ignore patterns)
4. For each enabled module:
   a. Module parses file into chunks (functions, classes, etc.)
   b. Module generates embeddings for each chunk
   c. Index data written to .raggrep/index/<module-id>/
   d. Manifest updated with file metadata
5. Summary displayed to user
```

### Search Flow

```
1. CLI parses query and options
2. Search loads global manifest
3. For each indexed module:
   a. Query embedding generated
   b. All indexed files loaded
   c. Cosine similarity computed for each chunk
   d. Results above threshold collected
4. Results aggregated, sorted by score
5. Top K results returned and displayed
```

## Index Structure

```
.raggrep/
├── config.json              # Project configuration (optional)
├── manifest.json            # Global manifest (lists active modules)
└── index/
    └── semantic/            # Per-module index directory
        ├── manifest.json    # Module manifest (file list, timestamps)
        └── src/
            └── auth/
                └── authService.json  # Per-file index (chunks + embeddings)
```

### File Index Format

Each indexed file produces a JSON file with:

```json
{
  "filepath": "src/auth/authService.ts",
  "lastModified": "2024-01-15T10:30:00.000Z",
  "chunks": [
    {
      "id": "src/auth/authService.ts:24-55",
      "content": "export async function login...",
      "startLine": 24,
      "endLine": 55,
      "type": "function"
    }
  ],
  "moduleData": {
    "embeddings": [[0.123, -0.456, ...]],
    "embeddingModel": "all-MiniLM-L6-v2"
  },
  "references": ["./session", "../users/types"]
}
```

## Embedding Model

RAGgrep uses [Transformers.js](https://huggingface.co/docs/transformers.js) for local embeddings.

**Default Model:** `all-MiniLM-L6-v2`
- 384 dimensions
- ~23MB download
- Good balance of speed and quality

**Model Caching:**
- Models downloaded on first use
- Cached at `~/.cache/raggrep/models/`
- Subsequent runs load from cache

## Chunk Types

The semantic module identifies these code structures:

| Type | Description |
|------|-------------|
| `function` | Function/method declarations |
| `class` | Class definitions |
| `interface` | TypeScript interfaces |
| `type` | TypeScript type aliases |
| `import` | Import statements (grouped) |
| `file` | Entire file (fallback for small files) |

## Future Extensions

The modular architecture supports adding:

- **TypeScript LSP Module** - Index symbols, references, type information
- **AST Module** - Syntax-aware code structure indexing
- **Dependency Module** - Track import/export relationships
- **Comment Module** - Index documentation and comments separately
