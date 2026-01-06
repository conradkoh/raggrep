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
│  │   Literal      │ │  ├── embeddings/  │ │      ├── typescript/    │
│  │   Introspection│ │  │   Transformers │ │      │   TS Compiler API│
│  │                │ │  ├── parsing/     │ │      ├── python/        │
│  ├── ports/       │ │  │   TreeSitter   │ │      │   Tree-sitter   │
│  │   IParser      │ │  │   GrammarMgr   │ │      ├── go/            │
│  │   FileSystem   │ │  ├── storage/     │ │      │   Tree-sitter   │
│  │   Embedding    │ │  │   FileStorage  │ │      └── rust/          │
│  │   Storage      │ │  │   SymbolicIndex│ │         Tree-sitter     │
│  │                │ │  │   LiteralIndex │ │                         │
│  └── services/    │ │  └── introspection│ │                         │
│      BM25Index    │ │      ProjectDetect│ │                         │
│      Introspection│ │      IntroIndex   │ │                         │
│      LiteralScore │ │                   │ │                         │
│      ConfigValid  │ │                   │ │                         │
└───────────────────┘ └───────────────────┘ └─────────────────────────┘
```

## Hybrid Search System

RAGgrep uses a hybrid scoring approach that combines semantic similarity, keyword matching, and literal boosting:

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

┌─────────────────────────────────────────────────────────────────┐
│              LITERAL INDEX (Exact Match Lookup)                 │
│         Maps identifier names to chunk locations                │
│            Enables O(1) exact-match retrieval                   │
│          With vocabulary extraction for partial matching        │
│                                                                 │
│  literals/                                                      │
│  └── _index.json (literal → chunkId + filepath + vocabulary)   │
│                                                                 │
│  Example:                                                       │
│    "getUserById" → {                                            │
│      chunkId: "...",                                            │
│      vocabulary: ["get", "user", "by", "id"]                   │
│    }                                                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│           INTROSPECTION INDEX (File Metadata)                   │
│         Contextual information about file locations             │
│            README hierarchy, path context, conventions          │
│                                                                 │
│  introspection/                                                 │
│  └── files/                                                     │
│      └── src/auth/session.json                                 │
│          {                                                      │
│            "nearestReadme": "src/auth/README.md",              │
│            "pathContext": {...},                               │
│            "conventions": [...]                                │
│          }                                                      │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    HYBRID SCORING                               │
│                                                                 │
│  Base Score = 0.6 × Semantic + 0.25 × BM25 + 0.15 × Vocab      │
│  Final Score = Base × LiteralMultiplier + Boosts               │
│                                                                 │
│  • Semantic: Cosine similarity of query vs chunk embeddings    │
│  • BM25: Keyword matching score                                 │
│  • Vocab: Vocabulary overlap between query and identifiers     │
│  • Literal: Multiplicative boost for exact identifier matches  │
│  • Boosts: Path context, file type, chunk type, exports        │
└─────────────────────────────────────────────────────────────────┘
```

### Why Hybrid Scoring?

| Approach      | Strength                      | Weakness                       |
| ------------- | ----------------------------- | ------------------------------ |
| Semantic only | Understands meaning, synonyms | May miss exact keyword matches |
| BM25 only     | Fast, exact matches           | No understanding of meaning    |
| **Hybrid**    | Best of both worlds           | Slightly more computation      |
| **+ Literal** | Precise identifier matching   | Requires AST parsing           |

The 60/25/15 weighting favors semantic understanding while still boosting keyword and vocabulary matches. Vocabulary scoring enables natural language queries like "where is user session validated" to find `validateUserSession()` by matching vocabulary overlap. Literal boosting adds a multiplicative factor when exact identifier names match, ensuring that searches for `AuthService` find that specific class first.

## Multi-Language Support

RAGgrep supports multiple languages with deep AST-aware parsing:

### TypeScript/JavaScript

- **Parser**: TypeScript Compiler API (primary)
- **Features**: Full type information, JSDoc extraction, interface/type detection
- **Chunks**: Functions, classes, interfaces, types, enums, full file chunks

### Python

- **Parser**: Tree-sitter (with regex fallback)
- **Features**: Docstring extraction, decorator handling
- **Chunks**: Functions, classes, methods, full file chunks

### Go

- **Parser**: Tree-sitter (with regex fallback)
- **Features**: Doc comment extraction, exported symbol detection
- **Chunks**: Functions, methods, structs, interfaces, full file chunks

### Rust

- **Parser**: Tree-sitter (with regex fallback)
- **Features**: Doc comment extraction (`///`, `//!`), visibility detection
- **Chunks**: Functions, structs, traits, impls, enums, full file chunks

### Parser Architecture

```
┌──────────────────────────────────────────────────┐
│           IParser Interface (Domain Port)        │
│  - parse(content, filepath, config)              │
│  - canParse(filepath)                            │
└──────────────────────────────────────────────────┘
                      │
        ┌─────────────┴──────────────┐
        ▼                            ▼
┌──────────────────┐      ┌──────────────────────┐
│ TypeScriptParser │      │  TreeSitterParser    │
│  (TS Compiler)   │      │  (web-tree-sitter)   │
│                  │      │                      │
│  - Rich types    │      │  - Multi-language    │
│  - JSDoc         │      │  - WASM-based        │
│  - Proven        │      │  - Regex fallback    │
└──────────────────┘      └──────────────────────┘
```

## Vocabulary-Based Search

Vocabulary extraction enables partial matching of code identifiers and natural language queries:

### How It Works

1. **Extract vocabulary** from identifiers at index time:

   - `getUserById` → `["get", "user", "by", "id"]`
   - `AuthService` → `["auth", "service"]`
   - `validate_session` → `["validate", "session"]`

2. **Index both** literal and vocabulary:

   - Literal index: `"getUserById"` → chunk123
   - Vocabulary index: `"get"`, `"user"`, `"by"`, `"id"` → chunk123

3. **Extract vocabulary** from queries at search time:

   - Query: `"where is user session validated"` → `["user", "session", "validated"]`
   - Stop words (`where`, `is`, `the`, etc.) are filtered out

4. **Match queries** against vocabulary:
   - Query `"user"` matches `getUserById`, `UserService`, `fetchUserData`
   - Query `"where is user session validated"` matches `validateUserSession` (overlap: `user`, `session`, `validate*`)
   - Score = matched words / query vocabulary words

### Scoring Tiers

| Match Type               | Example             | Score | Multiplier |
| ------------------------ | ------------------- | ----- | ---------- |
| Exact literal            | `getUserById`       | 1.0   | 2.5×       |
| High vocabulary (>75%)   | `get user by` (3/4) | 0.8   | 2.0×       |
| Medium vocabulary (>50%) | `get user` (2/4)    | 0.5   | 1.5×       |
| Low vocabulary (<50%)    | `user` (1/4)        | 0.3   | 1.2×       |

## Content Phrase Matching

Content phrase matching ensures that searches for exact phrases find results even when semantic and BM25 scores are low.

### The Problem

When searching for "authentication flow for new users", semantic search may produce low similarity scores because the embedding doesn't capture the exact phrase. BM25 tokenizes into separate words, losing phrase ordering. The result: exact matches in documentation are missed.

### The Solution

RAGgrep checks each chunk's content for:

1. **Exact phrase match**: Does `chunk.content` contain the query as a substring?
2. **Token coverage**: What percentage of query tokens appear in the content?

```
Query: "authentication flow for new users"
        │
        ▼
┌──────────────────────────────────────────────────┐
│           calculatePhraseMatch()                  │
│                                                   │
│  content.includes(query)?  →  exactMatch: true   │
│                               boost: +0.5        │
│                                                   │
│  80%+ tokens found?  →  highCoverage: true       │
│                        boost: +0.2               │
└──────────────────────────────────────────────────┘
```

### Scoring Impact

| Match Type | Boost | Filter Bypass |
|------------|-------|---------------|
| Exact phrase | +0.5 | Yes |
| 80%+ token coverage | +0.2 | Yes |
| 60%+ token coverage | +0.1 | No |

Chunks with exact phrase matches or high token coverage bypass the minimum score filter, ensuring they always appear in results.

## Literal Boosting

Literal boosting ensures that searches for specific code identifiers (class names, function names, etc.) return precise matches rather than semantically similar but incorrect results.

### The Problem

Semantic search treats all terms as concepts. A query for `AuthService` might return files about "authentication" or "services" rather than the actual `AuthService` class. This is because embedding models don't understand that `AuthService` is a specific identifier.

### The Solution: Two-Path Retrieval

RAGgrep uses two parallel retrieval paths:

```
Query: "find the `AuthService` class"
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│ Semantic + BM25  │    │ Literal Index    │
│ "find the class" │    │ "AuthService"    │
│ (remaining text) │    │ (exact lookup)   │
└────────┬─────────┘    └────────┬─────────┘
         │                       │
         │ Results with          │ Direct matches
         │ literal multiplier    │ (O(1) lookup)
         └───────────┬───────────┘
                     ▼
            Merged & Ranked Results
```

### Query Literal Detection

Literals are detected in queries through:

| Method         | Example                  | Confidence |
| -------------- | ------------------------ | ---------- |
| **Backticks**  | `` find `AuthService` `` | High       |
| **Quotes**     | `find "handleLogin"`     | High       |
| **PascalCase** | `find AuthService`       | Medium     |
| **camelCase**  | `find getUserById`       | Medium     |
| **SCREAMING**  | `find MAX_RETRIES`       | Medium     |

### Index-Time Extraction

The TypeScript module extracts literals from AST-parsed code structures:

| Code Structure | Indexed Literal      | Match Type |
| -------------- | -------------------- | ---------- |
| `class Foo`    | `Foo` (className)    | definition |
| `function bar` | `bar` (functionName) | definition |
| `interface X`  | `X` (interfaceName)  | definition |
| `type T`       | `T` (typeName)       | definition |
| `enum E`       | `E` (enumName)       | definition |

### Multiplicative Scoring

When a literal matches, the base score is multiplied (not added):

```
Final Score = (0.7 × Semantic + 0.3 × BM25) × LiteralMultiplier + Boosts
```

| Match Type | High Confidence | Medium Confidence |
| ---------- | --------------- | ----------------- |
| definition | 2.5×            | 2.0×              |
| reference  | 2.0×            | 1.5×              |
| import     | 1.5×            | 1.3×              |

### Literal-Only Results

Chunks found **only** by the literal index (not by semantic/BM25) still appear in results with a base score of 0.5. This ensures exact matches always surface, even if the query has low semantic similarity.

For detailed design documentation, see [Literal Boosting Design](./design/literal-boosting.md).

## Data Flow

### Indexing Flow

```
1. CLI parses arguments
2. Load config from index directory (or use defaults)
3. Find all matching files (respecting ignore patterns)
4. For each file (in parallel):
   a. Parse into chunks via AST (functions, classes, etc.)
   b. Generate embeddings for each chunk
   c. Extract keywords for symbolic index
   d. Extract literals from chunk names (for literal index)
   e. Write per-file index to index/<module>/
5. Build and persist BM25 index
6. Build and persist literal index
7. Update manifests
```

### Search Flow

```
1. Parse query for literals (explicit backticks, implicit patterns)
2. Extract vocabulary from query (filter stop words)
3. Load symbolic index (for path context and metadata)
4. Load literal index (for exact-match and vocabulary lookup)
5. Get list of all indexed files
6. Apply file pattern filters if specified (e.g., --type ts)
7. Generate query embedding (using remaining query after literal extraction)
8. Build literal match map from query literals
9. Query vocabulary index for chunks with overlapping vocabulary
10. For each indexed file:
    a. Load file index (chunks + embeddings)
    b. Build BM25 index from chunk contents
11. Compute BM25 scores for query
12. For each chunk:
    - Compute cosine similarity (semantic score)
    - Look up BM25 score (keyword score)
    - Look up vocabulary overlap score
    - Look up literal matches for chunk
    - Calculate base score = 0.6 × semantic + 0.25 × BM25 + 0.15 × vocab
    - Apply literal multiplier if matched
    - Add boosts (path, file type, chunk type, export)
13. Add literal-only results (chunks found only via literal index)
14. Filter by minimum score threshold (or high vocabulary overlap)
15. Sort by final score
16. Return top K results
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
            ├── literals/        # Literal index (exact-match lookup)
            │   └── _index.json  # Literal → chunk mappings
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

### Literal Index Format

**\_index.json** — Literal to chunk mappings:

```json
{
  "version": "1.0.0",
  "entries": {
    "authservice": [
      {
        "chunkId": "src-auth-authService_ts-10-45",
        "filepath": "src/auth/authService.ts",
        "originalCasing": "AuthService",
        "type": "className",
        "matchType": "definition"
      }
    ],
    "validatesession": [
      {
        "chunkId": "src-auth-session_ts-20-55",
        "filepath": "src/auth/session.ts",
        "originalCasing": "validateSession",
        "type": "functionName",
        "matchType": "definition"
      }
    ]
  }
}
```

The literal index enables O(1) lookup for exact identifier matches. Keys are lowercase for case-insensitive matching, but original casing is preserved for display.

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

| Component   | Description                                                   |
| ----------- | ------------------------------------------------------------- |
| `entities/` | Core data structures (Chunk, FileIndex, Config, Literal, etc) |
| `ports/`    | Interfaces for external dependencies                          |
| `services/` | Pure algorithms (BM25, keywords, literal parsing/scoring)     |

**Literal Boosting & Vocabulary Services:**

| Service                 | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| `queryLiteralParser.ts` | Detect literals in queries (backticks, casing)          |
| `literalExtractor.ts`   | Extract literals and vocabulary from chunks and queries |
| `literalScorer.ts`      | Calculate multipliers, vocabulary scores, merge results |

### Infrastructure Layer (`src/infrastructure/`)

Adapters implementing domain ports.

| Adapter                         | Port                | Implementation          |
| ------------------------------- | ------------------- | ----------------------- |
| `NodeFileSystem`                | `FileSystem`        | Node.js `fs` and `path` |
| `TransformersEmbeddingProvider` | `EmbeddingProvider` | Transformers.js         |
| `FileIndexStorage`              | `IndexStorage`      | JSON file storage       |
| `LiteralIndex`                  | —                   | Literal → chunk mapping |
| `SymbolicIndex`                 | —                   | BM25 + file metadata    |

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

| Module ID             | Location                           | Description                                                |
| --------------------- | ---------------------------------- | ---------------------------------------------------------- |
| `core`                | `src/modules/core/`                | Language-agnostic symbol extraction + BM25                 |
| `language/typescript` | `src/modules/language/typescript/` | AST parsing + embeddings + literal index + two-path search |

Both modules are enabled by default and run during indexing. Search aggregates results from all modules, sorted by score. The TypeScript module implements the full literal boosting pipeline.

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
- [x] **Literal boosting**: Exact identifier matching with multiplicative score boost (v0.7.0)

### Planned

- [ ] **Cross-reference boosting**: Boost files imported by matched results
- [ ] **Code-aware embeddings**: Use code-specific models like `CodeRankEmbed`
- [ ] **Pre-commit hook**: Auto-index changed files before commit

### Recently Completed (v0.8.0)

- [x] **Structured Semantic Expansion**: Synonym-based query expansion for improved recall
- [x] **Vocabulary-based Query Scoring**: Natural language queries match code identifiers via vocabulary overlap (e.g., "where is user session validated" → `validateUserSession`)
- [x] **Content Phrase Matching**: Exact phrases in documentation are found even when semantic/BM25 scores are low (e.g., "authentication flow for new users" finds markdown containing that exact phrase)

### Possible Extensions

- **Python Module**: AST-based indexing for Python files
- **Dependency Graph Module**: Track import/export relationships
- **Comment Module**: Index documentation separately
- **Binary storage**: Float32 arrays for faster embedding loading
