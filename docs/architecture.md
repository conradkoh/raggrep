# Architecture

## Design Goals

RAGgrep is built around three core principles:

| Goal                 | Description                                                       |
| -------------------- | ----------------------------------------------------------------- |
| **Local-first**      | Runs entirely on your machine — no servers or external API calls. |
| **Filesystem-based** | Index is just JSON files. Human-readable, debuggable, portable.   |
| **Persistent**       | Index lives alongside your code. No rebuilding on every search.   |

Additional goals:

| Goal            | Description                                                                        |
| --------------- | ---------------------------------------------------------------------------------- |
| **Incremental** | Only re-indexes changed files. Fast updates via file watching or pre-commit hooks. |
| **Transparent** | The index can be inspected, backed up, or versioned.                               |
| **Scalable**    | Optimized for small-to-medium codebases (1k–100k files).                           |

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
│  ├── entities/    │ │  ├── filesystem/  │ │  ├── language/          │
│  │   Chunk        │ │  │   NodeFS       │ │  │   └── typescript/    │
│  │   FileIndex    │ │  ├── embeddings/  │ │  └── core/ (planned)    │
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

## Two-Tier Index System

RAGgrep uses a two-layer index for efficient search on large codebases:

```
┌─────────────────────────────────────────────────────────────────┐
│              SYMBOLIC INDEX (Lightweight)                       │
│         Per-file summaries with extracted keywords              │
│                    Persisted BM25 index                         │
│                                                                 │
│  symbolic/                                                      │
│  ├── _meta.json (BM25 stats)                                   │
│  └── src/                                                       │
│      └── auth/                                                  │
│          └── authService.json (keywords, exports)               │
└───────────────────────┬─────────────────────────────────────────┘
                        │ BM25 filter → candidates
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│           EMBEDDING INDEX (Full Semantic Data)                  │
│            Chunk embeddings for semantic search                 │
│              Only loaded for candidate files                    │
│                                                                 │
│  src/auth/authService.json  ← loaded on demand                  │
│  (chunks + 384-dim embeddings)                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Why Two Tiers?

| Problem                                   | Solution                                           |
| ----------------------------------------- | -------------------------------------------------- |
| Loading all embeddings is slow            | Symbolic index filters first, load only candidates |
| Single large index file doesn't scale     | Per-file storage, parallel reads                   |
| BM25 rebuild on every search is expensive | Persist BM25 during indexing                       |
| Memory grows with codebase size           | Only relevant files loaded into memory             |

## Data Flow

### Indexing Flow

```
1. CLI parses arguments
2. Load config from .raggrep/config.json (or use defaults)
3. Find all matching files (respecting ignore patterns)
4. For each file:
   a. Parse into chunks (functions, classes, etc.)
   b. Generate embeddings for each chunk
   c. Extract keywords for symbolic index
   d. Write per-file index to .raggrep/index/<module>/
5. Build and persist BM25 index
6. Update manifests
```

### Search Flow

```
1. Load symbolic index (_meta.json)
2. BM25 search on file keywords
3. Select top candidate files (3× requested results)
4. Load embedding indexes only for candidates
5. For each chunk:
   - Compute cosine similarity (semantic score)
   - Compute BM25 score (keyword score)
   - Hybrid score = 0.7 × semantic + 0.3 × BM25
6. Sort by hybrid score
7. Return top K results
```

## Index Structure

```
.raggrep/
├── config.json              # Project configuration (optional)
├── manifest.json            # Global manifest (lists active modules)
└── index/
    ├── core/                # (Future) Language-agnostic text index
    │   └── ...
    │
    └── language/            # Language-specific indexes
        └── typescript/      # TypeScript/JavaScript index
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

**\_meta.json** — BM25 statistics:

```json
{
  "version": "1.0.0",
  "moduleId": "semantic",
  "fileCount": 8,
  "bm25Data": {
    "avgDocLength": 45.2,
    "documentFrequencies": { "login": 3, "user": 5, "auth": 2 },
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
  "keywords": [
    "login",
    "credentials",
    "email",
    "password",
    "authresult",
    "auth",
    "service"
  ],
  "exports": ["LoginCredentials", "AuthResult", "login", "logout"],
  "lastModified": "2025-11-25T09:28:14.665Z",
  "pathContext": {
    "segments": ["src", "auth"],
    "layer": "service",
    "domain": "auth",
    "depth": 2
  }
}
```

### Path-Aware Indexing

RAGgrep extracts structural information from file paths to improve search relevance:

**Path Context:**

- **segments**: Directory path split into parts
- **layer**: Detected architectural layer (service, controller, repository, etc.)
- **domain**: Feature domain detected from path (auth, users, payments, etc.)
- **depth**: Directory nesting level

**How It's Used:**

1. **Path keywords** are added to the BM25 index (e.g., "auth", "service", "api")
2. **Path context** is prepended to embeddings: `[auth service] export function login...`
3. **Search boosting**: Files with matching domain/layer get score boosts

### Embedding Index Format

**Per-file index** (e.g., `src/auth/authService.json`):

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
      "type": "function",
      "name": "login",
      "isExported": true
    }
  ],
  "moduleData": {
    "embeddings": [[0.123, -0.456, ...]],
    "embeddingModel": "all-MiniLM-L6-v2"
  },
  "references": ["./session", "../users/types"]
}
```

## Layer Details

### Domain Layer (`src/domain/`)

Pure business logic with **no external dependencies**.

| Component   | Description                                           |
| ----------- | ----------------------------------------------------- |
| `entities/` | Core data structures (Chunk, FileIndex, Config, etc.) |
| `ports/`    | Interfaces for external dependencies                  |
| `services/` | Pure algorithms (BM25 search, keyword extraction)     |

### Infrastructure Layer (`src/infrastructure/`)

Adapters implementing domain ports.

| Adapter                         | Port                | Implementation          |
| ------------------------------- | ------------------- | ----------------------- |
| `NodeFileSystem`                | `FileSystem`        | Node.js `fs` and `path` |
| `TransformersEmbeddingProvider` | `EmbeddingProvider` | Transformers.js         |
| `FileIndexStorage`              | `IndexStorage`      | JSON file storage       |

### Application Layer (`src/application/`)

Use cases orchestrating domain and infrastructure.

| Use Case         | Description          |
| ---------------- | -------------------- |
| `indexDirectory` | Index a codebase     |
| `searchIndex`    | Search the index     |
| `cleanupIndex`   | Remove stale entries |

### Index Modules (`src/modules/`)

Pluggable modules implementing the `IndexModule` interface.

**Current Modules:**

| Module ID             | Location                           | Description                                    |
| --------------------- | ---------------------------------- | ---------------------------------------------- |
| `language/typescript` | `src/modules/language/typescript/` | TypeScript/JavaScript AST parsing + embeddings |
| `core`                | (planned)                          | Language-agnostic text search                  |

See [design/introspection.md](./design/introspection.md) for the planned multi-index architecture.

```typescript
interface IndexModule {
  id: string;
  name: string;

  initialize?(config: ModuleConfig): Promise<void>;
  indexFile(
    filepath: string,
    content: string,
    ctx: IndexContext
  ): Promise<FileIndex | null>;
  finalize?(ctx: IndexContext): Promise<void>;
  search(
    query: string,
    ctx: SearchContext,
    options: SearchOptions
  ): Promise<SearchResult[]>;
}
```

## Embedding Model

RAGgrep uses [Transformers.js](https://huggingface.co/docs/transformers.js) for local embeddings.

**Default Model:** `all-MiniLM-L6-v2`

| Property       | Value                      |
| -------------- | -------------------------- |
| Dimensions     | 384                        |
| Download size  | ~23MB                      |
| Cache location | `~/.cache/raggrep/models/` |

**Available Models:**

| Model                     | Size  | Notes                 |
| ------------------------- | ----- | --------------------- |
| `all-MiniLM-L6-v2`        | ~23MB | Default, good balance |
| `all-MiniLM-L12-v2`       | ~33MB | Higher quality        |
| `bge-small-en-v1.5`       | ~33MB | Good for code         |
| `paraphrase-MiniLM-L3-v2` | ~17MB | Fastest               |

## Chunk Types

The TypeScript module uses the TypeScript Compiler API for AST-based parsing.

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

## Performance Characteristics

| Operation                     | Expected Time | Notes                                  |
| ----------------------------- | ------------- | -------------------------------------- |
| Initial indexing (1k files)   | 1-2 min       | Embedding generation is the bottleneck |
| Incremental update (10 files) | <2s           | Per-file writes only                   |
| Search latency                | ~100-500ms    | Depends on candidate count             |
| Concurrent writes             | Safe          | Per-file updates, no global lock       |

**Scaling limits:**

- Optimized for 1k–100k files
- Beyond 100k files, consider sharding or dedicated vector databases

## Design Decisions

### Why Filesystem vs. SQLite?

| Factor              | Filesystem | SQLite    |
| ------------------- | ---------- | --------- |
| Setup complexity    | ⭐ Simple  | ⭐ Simple |
| Transparency        | ⭐⭐⭐⭐   | ⭐        |
| Incremental updates | ⭐⭐⭐⭐   | ⭐⭐      |
| Bulk search speed   | ⭐⭐       | ⭐⭐⭐⭐  |
| Memory footprint    | ⭐⭐⭐⭐   | ⭐⭐      |
| Concurrency         | ⭐⭐⭐⭐   | ⭐⭐      |
| Debuggability       | ⭐⭐⭐⭐   | ⭐        |

**Verdict:** Filesystem wins for transparency, incremental updates, and debuggability. SQLite is better for complex queries and bulk operations.

### Why Local Embeddings?

- **Privacy**: Code never leaves your machine
- **Offline**: Works without internet
- **Speed**: No network latency for embedding calls
- **Cost**: No API fees

Trade-off: Local models are smaller than cloud models (384 vs 1536+ dimensions), but sufficient for code search.

## Future Enhancements

### Planned

- [x] **Watch mode**: Real-time index updates on file changes (`raggrep index --watch`)
- [ ] **Cross-reference boosting**: Boost files imported by matched results
- [ ] **Code-aware embeddings**: Use `codebert` or similar for better code understanding
- [ ] **Pre-commit hook**: Auto-index changed files before commit

### Possible Extensions

- **TypeScript LSP Module**: Index symbols, references, type information
- **Dependency Graph Module**: Track import/export relationships
- **Comment Module**: Index documentation separately
- **Binary storage**: Float32 arrays for faster embedding loading
