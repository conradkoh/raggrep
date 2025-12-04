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
│                         CLI (src/app/cli/)                          │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────┐
│                    Application Layer (src/app/)                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Orchestration: indexer/, search/                            │   │
│  │  Use Cases: indexDirectory, searchIndex, cleanupIndex        │   │
│  └──────────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────────┐ ┌───────────────────┐ ┌─────────────────────────┐
│  Domain Layer     │ │  Infrastructure   │ │   Index Modules         │
│  (src/domain/)    │ │  (src/infra-     ││ │   (src/modules/)        │
│                   │ │   structure/)     │ │                         │
│  ├── entities/    │ │                   │ │  ├── core/              │
│  │   Chunk        │ │  ├── config/      │ │  │   Symbol extraction  │
│  │   FileIndex    │ │  │   ConfigLoader │ │  │   BM25 keyword index │
│  │   Config       │ │  ├── filesystem/  │ │  │                      │
│  │   FileSummary  │ │  │   NodeFS       │ │  └── language/          │
│  │                │ │  ├── embeddings/  │ │      └── typescript/    │
│  ├── ports/       │ │  │   Transformers │ │         AST parsing     │
│  │   FileSystem   │ │  ├── storage/     │ │         Embeddings      │
│  │   Embedding    │ │  │   FileStorage  │ │                         │
│  │   Storage      │ │  │   SymbolicIndex│ │                         │
│  │                │ │  └── introspection│ │                         │
│  └── services/    │ │      ProjectDetect│ │                         │
│      BM25Index    │ │      IntroIndex   │ │                         │
│      Introspection│ │                   │ │                         │
│      Conventions  │ │                   │ │                         │
└───────────────────┘ └───────────────────┘ └─────────────────────────┘
```

## Hybrid Search System

RAGgrep uses a hybrid scoring approach that combines semantic similarity with keyword matching:

```
┌─────────────────────────────────────────────────────────────────┐
│              SYMBOLIC INDEX (Metadata & Keywords)               │
│         Per-file summaries with extracted keywords              │
│            Used for path context and boost calculation          │
│                                                                 │
│  symbolic/                                                      │
│  ├── _meta.json (file metadata)                                │
│  └── src/                                                       │
│      └── auth/                                                  │
│          └── authService.json (keywords, exports, path context) │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│           EMBEDDING INDEX (Full Semantic Data)                  │
│            Chunk embeddings for semantic search                 │
│                                                                 │
│  src/auth/authService.json                                      │
│  (chunks + 384/768-dim embeddings)                              │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    HYBRID SCORING                               │
│                                                                 │
│  Final Score = 0.7 × Semantic + 0.3 × BM25 + Boosts            │
│                                                                 │
│  • Semantic: Cosine similarity of query vs chunk embeddings    │
│  • BM25: Keyword matching score                                 │
│  • Boosts: Path context, file type, chunk type, exports        │
└─────────────────────────────────────────────────────────────────┘
```

### Why Hybrid Scoring?

| Approach      | Strength                      | Weakness                       |
| ------------- | ----------------------------- | ------------------------------ |
| Semantic only | Understands meaning, synonyms | May miss exact keyword matches |
| BM25 only     | Fast, exact matches           | No understanding of meaning    |
| **Hybrid**    | Best of both worlds           | Slightly more computation      |

The 70/30 weighting favors semantic understanding while still boosting exact keyword matches.

## Data Flow

### Indexing Flow

```
1. CLI parses arguments
2. Load config from index directory (or use defaults)
3. Find all matching files (respecting ignore patterns)
4. For each file (in parallel):
   a. Parse into chunks (functions, classes, etc.)
   b. Generate embeddings for each chunk
   c. Extract keywords for symbolic index
   d. Write per-file index to index/<module>/
5. Build and persist BM25 index
6. Update manifests
```

### Search Flow

```
1. Load symbolic index (for path context and metadata)
2. Get list of all indexed files
3. Apply file pattern filters if specified (e.g., --type ts)
4. Generate query embedding
5. For each indexed file:
   a. Load file index (chunks + embeddings)
   b. Build BM25 index from chunk contents
6. Compute BM25 scores for query
7. For each chunk:
   - Compute cosine similarity (semantic score)
   - Look up BM25 score (keyword score)
   - Calculate boosts (path, file type, chunk type, export)
   - Hybrid score = 0.7 × semantic + 0.3 × BM25 + boosts
8. Filter by minimum score threshold
9. Sort by hybrid score
10. Return top K results
```

> **Note:** The current implementation loads all embeddings before scoring.
> For very large codebases (100k+ files), this may use significant memory.
> Future versions may implement BM25 pre-filtering for better scalability.

## Index Structure

Index data is stored in a **system temp directory** (not in your project) to keep your codebase clean:

```
# Location: /tmp/raggrep-indexes/<project-hash>/
# The <project-hash> is derived from your project's absolute path

<temp>/raggrep-indexes/<hash>/
├── config.json              # Project configuration (optional)
├── manifest.json            # Global manifest (lists active modules)
├── introspection/           # Shared file metadata
│   ├── _project.json        # Detected project structure
│   └── files/               # Per-file introspection
│       └── src/auth/
│           └── authService.json
│
└── index/
    ├── core/                # Language-agnostic text index
    │   ├── manifest.json    # Module manifest
    │   ├── symbols.json     # Symbol index + BM25 data
    │   └── src/auth/
    │       └── authService.json  # Per-file chunk index
    │
    └── language/            # Language-specific indexes
        └── typescript/      # TypeScript/JavaScript index
            ├── manifest.json    # Module manifest (file list, timestamps)
            ├── symbolic/        # Symbolic index (keywords + BM25)
            │   ├── _meta.json   # BM25 statistics
            │   └── src/auth/
            │       └── authService.json  # File summary
            └── src/auth/
                └── authService.json  # Full index (chunks + embeddings)
```

Both modules create per-file JSON indexes that mirror your source directory structure.

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
    "embeddingModel": "bge-small-en-v1.5"
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

### Application Layer (`src/app/`)

Orchestration layer coordinating domain and infrastructure.

| Directory  | Description                              |
| ---------- | ---------------------------------------- |
| `indexer/` | Index orchestration, file watcher        |
| `search/`  | Search orchestration, result aggregation |
| `cli/`     | Command-line interface                   |

### Index Modules (`src/modules/`)

Pluggable modules implementing the `IndexModule` interface.

**Current Modules:**

| Module ID             | Location                           | Description                                    |
| --------------------- | ---------------------------------- | ---------------------------------------------- |
| `core`                | `src/modules/core/`                | Language-agnostic symbol extraction + BM25     |
| `language/typescript` | `src/modules/language/typescript/` | TypeScript/JavaScript AST parsing + embeddings |

Both modules are enabled by default and run during indexing. Search aggregates results from all modules, sorted by score.

### Introspection

Shared metadata extraction for context-aware search boosting. **Status: Implemented with Clean Architecture.**

Introspection is split across layers following Clean Architecture:

**Domain Layer (`src/domain/`):**

| Component                   | Description                                                  |
| --------------------------- | ------------------------------------------------------------ |
| `entities/introspection.ts` | Types: FileIntrospection, ProjectStructure, Scope            |
| `entities/conventions.ts`   | Types: FileConvention, FrameworkConventions, ConventionMatch |
| `services/introspection.ts` | Pure functions: introspectFile, introspectionToKeywords      |
| `services/conventions/`     | Pure pattern matching for file conventions                   |

**Infrastructure Layer (`src/infrastructure/introspection/`):**

| Component               | Description                               |
| ----------------------- | ----------------------------------------- |
| `projectDetector.ts`    | Filesystem scanning for project structure |
| `IntrospectionIndex.ts` | Save/load introspection data to disk      |

**File Conventions (`src/domain/services/conventions/`):**

The conventions module provides semantic keyword extraction for special file patterns:

| Convention Type    | Examples                                        |
| ------------------ | ----------------------------------------------- |
| Entry Points       | `index.ts`, `main.ts`, `App.tsx`, `__init__.py` |
| Configuration      | `tsconfig.json`, `package.json`, `.prettierrc`  |
| Framework-specific | Next.js routes, Convex functions                |
| Type Definitions   | `*.d.ts`, `*.types.ts`, `types/` folder         |
| Test Files         | `*.test.ts`, `*.spec.ts`, `__tests__/` folder   |
| Build/Deploy       | `Dockerfile`, `docker-compose.yml`, `.github/`  |

**Currently detected metadata:**

- **Path context**: Segments, layer, domain, depth (used for search boosting)
- **Project structure**: Monorepo detection, project type inference
- **Language**: Detected from file extension
- **Convention keywords**: Semantic keywords from file patterns
- **Framework detection**: Next.js, Convex, and more

```typescript
interface IndexModule {
  id: string;
  name: string;
  version: string;

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

**Default Model:** `bge-small-en-v1.5`

| Property       | Value                      |
| -------------- | -------------------------- |
| Dimensions     | 384                        |
| Download size  | ~33MB                      |
| Cache location | `~/.cache/raggrep/models/` |

**Available Models:**

| Model                     | Dimensions | Size   | Notes                              |
| ------------------------- | ---------- | ------ | ---------------------------------- |
| `bge-small-en-v1.5`       | 384        | ~33MB  | **Default**, best balance for code |
| `nomic-embed-text-v1.5`   | 768        | ~270MB | Higher quality, larger             |
| `all-MiniLM-L6-v2`        | 384        | ~23MB  | Fast, good general purpose         |
| `all-MiniLM-L12-v2`       | 384        | ~33MB  | Higher quality than L6             |
| `paraphrase-MiniLM-L3-v2` | 384        | ~17MB  | Fastest, lower quality             |

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

Trade-off: Local models are smaller than cloud models (384-768 vs 1536+ dimensions), but sufficient for code search.

## Future Enhancements

### Completed

- [x] **Watch mode**: Real-time index updates on file changes (`raggrep index --watch`)
- [x] **Core module**: Language-agnostic symbol extraction with BM25
- [x] **Introspection**: Basic path context and project detection
- [x] **Framework detection**: Next.js, Convex conventions
- [x] **Path filtering**: Filter search results by path prefix
- [x] **Improved embedding model**: Changed default to `bge-small-en-v1.5`
- [x] **Higher-quality model option**: Added `nomic-embed-text-v1.5` (768 dimensions)

### Planned

- [ ] **Cross-reference boosting**: Boost files imported by matched results
- [ ] **Code-aware embeddings**: Use code-specific models like `CodeRankEmbed`
- [ ] **Pre-commit hook**: Auto-index changed files before commit

### Possible Extensions

- **Python Module**: AST-based indexing for Python files
- **Dependency Graph Module**: Track import/export relationships
- **Comment Module**: Index documentation separately
- **Binary storage**: Float32 arrays for faster embedding loading
