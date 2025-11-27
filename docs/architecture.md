# Architecture

## Overview

RAGgrep follows Clean Architecture principles with clear separation between:
- **Domain**: Core business logic with no external dependencies
- **Infrastructure**: External system adapters (filesystem, ML models)
- **Application**: Use cases orchestrating domain and infrastructure
- **Presentation**: CLI interface

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLI (src/cli/)                            │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────┐
│                    Application Layer (src/application/)              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Use Cases: indexDirectory, searchIndex, cleanupIndex        │   │
│  └──────────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────────┐ ┌───────────────────┐ ┌─────────────────────────┐
│  Domain Layer     │ │  Infrastructure   │ │   Index Modules         │
│  (src/domain/)    │ │ (src/infra/)      │ │   (src/modules/)        │
│                   │ │                   │ │                         │
│  ├── entities/    │ │  ├── filesystem/  │ │  ├── semantic/          │
│  │   Chunk        │ │  │   NodeFS       │ │  │   Embeddings+Search  │
│  │   FileIndex    │ │  ├── embeddings/  │ │  └── (future modules)   │
│  │   Config       │ │  │   Transformers │ │                         │
│  │                │ │  └── storage/     │ │                         │
│  ├── ports/       │ │      FileStorage  │ │                         │
│  │   FileSystem   │ │                   │ │                         │
│  │   Embedding    │ │                   │ │                         │
│  │   Storage      │ │                   │ │                         │
│  │                │ │                   │ │                         │
│  └── services/    │ │                   │ │                         │
│      BM25Index    │ │                   │ │                         │
│      Keywords     │ │                   │ │                         │
└───────────────────┘ └───────────────────┘ └─────────────────────────┘
```

## Layer Responsibilities

### Domain Layer (`src/domain/`)

Pure business logic with **no external dependencies**.

- **entities/**: Core data structures (Chunk, FileIndex, Config, etc.)
- **ports/**: Interfaces for external dependencies (FileSystem, EmbeddingProvider)
- **services/**: Pure algorithms (BM25 search, keyword extraction)

### Infrastructure Layer (`src/infrastructure/`)

Adapters implementing domain ports.

- **filesystem/**: Node.js filesystem adapter
- **embeddings/**: Transformers.js embedding provider
- **storage/**: File-based index storage

### Application Layer (`src/application/`)

Use cases orchestrating domain and infrastructure.

- **indexDirectory**: Index a codebase
- **searchIndex**: Search the index
- **cleanupIndex**: Remove stale entries

## Core Components

### Domain Entities (`src/domain/entities/`)

Core data structures with no dependencies:

| Entity | Description |
|--------|-------------|
| `Chunk` | A semantic unit of code (function, class, etc.) |
| `FileIndex` | Index data for a single file (Tier 2) |
| `FileSummary` | Lightweight file summary (Tier 1) |
| `SearchResult` | A search result with score |
| `Config` | Application configuration |

### Domain Services (`src/domain/services/`)

Pure algorithms and business logic:

| Service | Description |
|---------|-------------|
| `BM25Index` | Keyword-based search using BM25 algorithm |
| `extractKeywords` | Extract keywords from code |
| `tokenize` | Tokenize text for search |

### Domain Ports (`src/domain/ports/`)

Interfaces for external dependencies:

| Port | Description |
|------|-------------|
| `FileSystem` | Abstract filesystem operations |
| `EmbeddingProvider` | Abstract embedding generation |
| `IndexStorage` | Abstract index persistence |

### Infrastructure (`src/infrastructure/`)

Concrete implementations of domain ports:

| Adapter | Port | Description |
|---------|------|-------------|
| `NodeFileSystem` | FileSystem | Node.js fs/path |
| `TransformersEmbeddingProvider` | EmbeddingProvider | Transformers.js |
| `FileIndexStorage` | IndexStorage | JSON file storage |

### Index Modules (`src/modules/`)

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
  indexFile(
    filepath: string,
    content: string,
    ctx: IndexContext
  ): Promise<FileIndex | null>;
  search(
    query: string,
    ctx: SearchContext,
    options: SearchOptions
  ): Promise<SearchResult[]>;
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

### Search Flow (Tiered Hybrid Search)

RAGgrep uses a tiered index system for efficient search on large codebases:

```
┌─────────────────────────────────────────────────────────────┐
│                    TIER 1 (Lightweight)                     │
│            File-level summaries with keywords               │
│                 Persisted BM25 index                        │
│                                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ File A  │ │ File B  │ │ File C  │ │  ...    │          │
│  │keywords │ │keywords │ │keywords │ │         │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
└───────────────────────┬─────────────────────────────────────┘
                        │ BM25 filter
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    TIER 2 (Full Data)                       │
│            Chunk embeddings for semantic search             │
│              Only loaded for candidate files                │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   File A.json   │  │   File C.json   │                  │
│  │ chunks + embeds │  │ chunks + embeds │                  │
│  └─────────────────┘  └─────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

**Search Steps:**

```
1. CLI parses query and options
2. Tier 1: Load lightweight file summaries
   a. BM25 search on file keywords
   b. Select top candidate files (3× topK)
3. Tier 2: Load only candidate file indexes
   a. Query embedding generated
   b. For each chunk in candidate files:
      - Cosine similarity computed (semantic score)
      - BM25 score computed (keyword score)
      - Hybrid score = 0.7 × semantic + 0.3 × BM25
4. Results sorted by hybrid score
5. Top K results returned
```

**Benefits of Tiered Approach:**

- **Memory efficient**: Only loads relevant files, not entire index
- **Scales to large codebases**: O(candidates) instead of O(all files)
- **Persistent BM25**: Built once during indexing, not every search
- **Filesystem-based**: Keeps index on disk, queries from disk

## Index Structure

```
.raggrep/
├── config.json              # Project configuration (optional)
├── manifest.json            # Global manifest (lists active modules)
└── index/
    └── semantic/            # Per-module index directory
        ├── manifest.json    # Module manifest (file list, timestamps)
        ├── tier1.json       # Tier 1: Lightweight file summaries + BM25 data
        └── src/
            └── auth/
                └── authService.json  # Tier 2: Per-file chunks + embeddings
```

### Tier 1 Index Format (tier1.json)

Lightweight summaries for fast filtering:

```json
{
  "version": "1.0.0",
  "moduleId": "semantic",
  "files": {
    "src/auth/authService.ts": {
      "filepath": "src/auth/authService.ts",
      "chunkCount": 5,
      "chunkTypes": ["function", "class", "interface"],
      "keywords": ["login", "authenticate", "session", "user"],
      "exports": ["login", "logout", "AuthService"],
      "lastModified": "2024-01-15T10:30:00.000Z"
    }
  },
  "bm25Data": {
    "avgDocLength": 45,
    "documentFrequencies": { "user": 12, "auth": 8 },
    "totalDocs": 150
  }
}
```

### Tier 2 Index Format (Per-File)

Each indexed file produces a JSON file with full chunk data:

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

The semantic module uses the TypeScript Compiler API for accurate AST-based parsing.
It identifies these code structures:

| Type        | Description                                             |
| ----------- | ------------------------------------------------------- |
| `function`  | Function declarations, arrow functions, async functions |
| `class`     | Class definitions                                       |
| `interface` | TypeScript interfaces                                   |
| `type`      | TypeScript type aliases                                 |
| `enum`      | Enum declarations                                       |
| `variable`  | Exported constants/variables                            |
| `block`     | Code blocks (for non-TS files)                          |
| `file`      | Entire file (fallback for small files)                  |

### Chunk Metadata

Each chunk also includes:

- **name** - The identifier name (function name, class name, etc.)
- **isExported** - Whether the construct is exported
- **jsDoc** - JSDoc comments if present

## Future Extensions

The modular architecture supports adding:

- **TypeScript LSP Module** - Index symbols, references, type information
- **AST Module** - Syntax-aware code structure indexing
- **Dependency Module** - Track import/export relationships
- **Comment Module** - Index documentation and comments separately
