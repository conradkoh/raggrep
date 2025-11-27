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

| Entity         | Description                                     |
| -------------- | ----------------------------------------------- |
| `Chunk`        | A semantic unit of code (function, class, etc.) |
| `FileIndex`    | Index data for a single file (Tier 2)           |
| `FileSummary`  | Lightweight file summary (Tier 1)               |
| `SearchResult` | A search result with score                      |
| `Config`       | Application configuration                       |

### Domain Services (`src/domain/services/`)

Pure algorithms and business logic:

| Service           | Description                               |
| ----------------- | ----------------------------------------- |
| `BM25Index`       | Keyword-based search using BM25 algorithm |
| `extractKeywords` | Extract keywords from code                |
| `tokenize`        | Tokenize text for search                  |

### Domain Ports (`src/domain/ports/`)

Interfaces for external dependencies:

| Port                | Description                    |
| ------------------- | ------------------------------ |
| `FileSystem`        | Abstract filesystem operations |
| `EmbeddingProvider` | Abstract embedding generation  |
| `IndexStorage`      | Abstract index persistence     |

### Infrastructure (`src/infrastructure/`)

Concrete implementations of domain ports:

| Adapter                         | Port              | Description       |
| ------------------------------- | ----------------- | ----------------- |
| `NodeFileSystem`                | FileSystem        | Node.js fs/path   |
| `TransformersEmbeddingProvider` | EmbeddingProvider | Transformers.js   |
| `FileIndexStorage`              | IndexStorage      | JSON file storage |

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

### Search Flow (Symbolic + Semantic Hybrid Search)

RAGgrep uses a two-layer index system for efficient search on large codebases:

```
┌─────────────────────────────────────────────────────────────┐
│              SYMBOLIC INDEX (Lightweight)                   │
│         Per-file summaries with extracted keywords          │
│                    Persisted BM25 index                     │
│                                                             │
│  symbolic/                                                  │
│  ├── _meta.json (BM25 stats)                               │
│  └── src/                                                   │
│      └── auth/                                              │
│          └── authService.json (keywords, exports)           │
└───────────────────────┬─────────────────────────────────────┘
                        │ BM25 filter → candidates
                        ▼
┌─────────────────────────────────────────────────────────────┐
│           EMBEDDING INDEX (Full Semantic Data)              │
│            Chunk embeddings for semantic search             │
│              Only loaded for candidate files                │
│                                                             │
│  src/auth/authService.json  ← loaded on demand              │
│  (chunks + 384-dim embeddings)                              │
└─────────────────────────────────────────────────────────────┘
```

**Search Steps:**

```
1. CLI parses query and options
2. Symbolic Index: Fast keyword filtering
   a. Load _meta.json + file summaries
   b. BM25 search on file keywords
   c. Select top candidate files (3× topK)
3. Embedding Index: Load only candidate files
   a. Query embedding generated
   b. For each chunk in candidate files:
      - Cosine similarity computed (semantic score)
      - BM25 score computed (keyword score)
      - Hybrid score = 0.7 × semantic + 0.3 × BM25
4. Results sorted by hybrid score
5. Top K results returned
```

**Benefits of Two-Layer Approach:**

- **Scales to large codebases**: Per-file storage, no single giant file
- **Memory efficient**: Only loads relevant files, not entire index
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
        ├── symbolic/        # Symbolic index (keywords + BM25)
        │   ├── _meta.json   # BM25 statistics
        │   └── src/
        │       └── auth/
        │           └── authService.json  # File summary
        └── src/
            └── auth/
                └── authService.json  # Full index (chunks + embeddings)
```

### Symbolic Index Format

**\_meta.json** - BM25 statistics:

```json
{
  "version": "1.0.0",
  "moduleId": "semantic",
  "fileCount": 8,
  "bm25Data": {
    "avgDocLength": 0,
    "documentFrequencies": {},
    "totalDocs": 8
  }
}
```

**Per-file summary** (e.g., `symbolic/src/auth/authService.json`):

```json
{
  "filepath": "src/auth/authService.ts",
  "chunkCount": 6,
  "chunkTypes": ["interface", "function"],
  "keywords": ["login", "credentials", "email", "password", "authresult", ...],
  "exports": ["LoginCredentials", "AuthResult", "login", "logout"],
  "lastModified": "2025-11-25T09:28:14.665Z"
}
```

### Embedding Index Format (Per-File)

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
