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
│      SimpleSearch │ │                   │ │ Grep-like exact matching |
│      ConfigValid  │ │                   │ │                         │
└───────────────────┘ └───────────────────┘ └─────────────────────────┘
```

## Hybrid Search System

RAGgrep uses a dual-track hybrid search approach combining semantic similarity, keyword matching, literal boosting, and exact text matching:

```
┌─────────────────────────────────────────────────────────────────┐
│             EXACT MATCH TRACK (Simple Search)                   │
│            Grep-like search across all file types               │
│          Finds identifiers in YAML, .env, config, etc.          │
│                                                                 │
│  Runtime filesystem walk (no index, pure search)                │
│  ├── Filters: node_modules, .git, dist, build, etc.            │
│  ├── Content detection: binary check, size limit (1MB)         │
│  └── Pattern matching: identifier detection (SCREAMING_SNAKE)  │
└─────────────────────────────────────────────────────────────────┘

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
│                   HYBRID SCORING (DUAL TRACK)                   │
│                                                                 │
│  SEMANTIC TRACK (configurable weights — see rankingWeights.ts):   │
│    TypeScript: tw.semantic×Sem + tw.bm25×BM25 + tw.vocab×Vocab   │
│    (defaults ≈ 0.43 / 0.42 / 0.15; tune via RankingWeightsConfig) │
│    Final fused score = literal boost + additive boosts + discriminative adj. │
│                                                                 │
│  EXACT MATCH TRACK:                                             │
│    • Grep-like search across all files (no index required)     │
│    • Returns: file paths, line numbers, context lines          │
│    • Sorted by: match count (most occurrences first)           │
│                                                                 │
│  FUSION BOOSTING:                                               │
│    • If exact matches found, boost hybrid hits in those files  │
│    • Fusion: 1.5× on fused score; 1.5× on structuredMatch (after scales) │
│    • Context mark: results.exactMatchFusion = true             │
│                                                                 │
│  SCORING COMPONENTS:                                            │
│    • Semantic: Cosine similarity of query vs chunk embeddings  │
│    • BM25: Keyword matching score                              │
│    • Vocab: Vocabulary overlap between query and identifiers   │
│    • Literal: Multiplicative boost for exact identifier match  │
│    • Boosts: Path context, file type, chunk type, exports      │
│    • Discriminative terms: BM25-IDF salience boost/penalty (TS, MD, …) │
└─────────────────────────────────────────────────────────────────┘
```

### Match scales & result ordering

After modules return fused `score` values, the app layer (**`src/app/search/index.ts`**) derives two comparable **[0, 1]** scales for each hit (**`src/domain/services/matchScales.ts`**):

| Field | Meaning |
| ----- | ------- |
| **`semanticMatch`** | Embedding track, from cosine similarity mapped to a percentage. |
| **`structuredMatch`** | Non-embedding signals (BM25, vocab, path/heading/phrase boosts, etc.), blended per `moduleId`. |

**`SearchOptions.rankBy`** (CLI: `--rank-by`) controls sort order after aggregation:

- **`structured`** (default) — `structuredMatch` primary, then `semanticMatch`, then fused `score`.
- **`semantic`** — `semanticMatch` primary, then `structuredMatch`, then `score`.
- **`combined`** — fused `score` only (legacy-style ordering).

When identifier exact-match fusion runs, hits in files with grep matches get **`score × 1.5`** and **`structuredMatch × 1.5`** so ranking stays aligned with the displayed scales.

Weights for the TS/BM25/vocab **blend** and literal/discriminative knobs live in **`src/domain/entities/rankingWeights.ts`** (`mergeRankingWeights()`), overridable via search options or config.

### Why Dual-Track Hybrid Scoring?

| Approach      | Strength                      | Weakness                       |
| ------------- | ----------------------------- | ------------------------------ |
| Semantic only | Understands meaning, synonyms | May miss exact keyword matches |
| BM25 only     | Fast, exact matches           | No understanding of meaning    |
| Grep only     | Finds text in ANY file        | No relevance ranking, slow    |
| **Hybrid**    | Best of both worlds           | Slightly more computation      |
| **+ Exact**   | Finds configs, YAML, .env   | Requires filesystem walk      |

The dual-track approach (semantic + exact match) ensures:
1. **Code**: Semantic search finds by meaning in AST-parsed code
2. **Config files**: Exact match track finds identifiers in YAML, .env, docker-compose.yml
3. **Fusion boosting**: Files with exact matches get **1.5×** on fused `score` and **1.5×** on `structuredMatch` (see `hybridSearch()`)
4. **Precision**: Exact matches shown separately with line numbers and context

Default **TypeScript** weights (`RankingWeightsConfig.typescript`) favor a balanced semantic + lexical mix (see `rankingWeights.ts`; values are tuned via golden-query benchmarks). Vocabulary scoring enables natural language queries like "where is user session validated" to find `validateUserSession()` by matching vocabulary overlap. Literal boosting applies a multiplicative factor when exact identifier names match, ensuring that searches for `AuthService` find that specific class first.

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

When a literal matches, the **weighted base** (semantic + BM25 + vocab for TypeScript, with per-module weights from `mergeRankingWeights()`) is passed through the literal multiplier pipeline, then additive boosts and discriminative adjustment are applied (see TypeScript `search()` in `src/modules/language/typescript/index.ts`).

```
Base = tw.semantic×Semantic + tw.bm25×BM25 + tw.vocab×Vocab   (TypeScript)
Boosted = applyLiteralBoost(base, …)
Final = (Boosted + path/file/chunk/phrase boosts) with discriminative boost/penalty
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
1. Parse query for identifier patterns (SCREAMING_SNAKE, camelCase, PascalCase, backticks)
2. Search enabled index modules (semantic / hybrid per module). If the query is identifier-like, also run the exact-match track:
   ├─ SEMANTIC TRACK (steps 3-16):
   │  3. Extract vocabulary from query (filter stop words)
   │  4. Load symbolic index (for path context and metadata)
   │  5. Load literal index (for exact-match and vocabulary lookup)
   │  6. Get list of all indexed files
   │  7. Apply file pattern filters if specified (e.g., --type ts)
   │  8. Generate query embedding (using remaining query after literal extraction)
   │  9. Build literal match map from query literals
   │  10. Query vocabulary index for chunks with overlapping vocabulary
   │  11. For each indexed file:
   │      a. Load file index (chunks + embeddings)
   │      b. Build BM25 index from chunk contents
   │  12. Compute BM25 scores for query
   │  13. For each chunk:
   │      - Compute cosine similarity (semantic score)
   │      - Look up BM25 score (keyword score)
   │      - Look up vocabulary overlap score
   │      - Look up literal matches for chunk
   │      - Calculate weighted base score (module-specific: TS uses semantic/bm25/vocab weights)
   │      - Apply literal multiplier if matched; add boosts; apply discriminative terms
   │  14. Filter by minimum score threshold (or high vocabulary overlap)
   │  15. Merge results from all modules; attach semanticMatch / structuredMatch (matchScales)
   │  16. Sort by SearchOptions.rankBy (default structured-first)
   │
   └─ EXACT MATCH TRACK (steps 17-23):
   │  17. Walk filesystem (respecting ignore patterns)
   │  18. Apply path filters (--filter options)
   │  19. For each file:
   │      a. Read content (skip binary, >1MB files)
   │      b. Find all occurrences of literal
   │      c. Capture line numbers and context lines (±1)
   │  20. Collect top 20 files by match count
   │  21. Sort by match count (highest first)
   │  22. Return ExactMatchResults
   │
   23. FUSION (if exact matches found):
   │      - Identify files with exact matches
   │      - Boost semantic results in those files (1.5x on score; 1.5x on structuredMatch)
   │      - Mark with exactMatchFusion flag
   │
   24. Return HybridSearchResults:
   │      - results[] (semantic track with fusion boost)
   │      - exactMatches (grep-like results)
   │      - fusionApplied (boolean)
```

> **Note:** The current implementation loads all embeddings before scoring.
> For very large codebases (100k+ files), this may use significant memory.
> Future versions may implement BM25 pre-filtering for better scalability.

## Index Structure

Index data is stored under **`{projectRoot}/.raggrep/`** by default (`RAGGREP_INDEX_DIR` in `src/infrastructure/config/configLoader.ts`). This keeps the index next to the tree you index or pass with `--dir` / `-C`. Add `.raggrep/` to `.gitignore` if you do not want index files in version control.

```
project/
└── .raggrep/
    ├── config.json              # Project + module configuration (optional overrides)
    ├── manifest.json            # Global manifest (lists active modules)
    ├── introspection/           # Shared file metadata
    │   ├── _project.json
    │   └── files/               # Per-file introspection (mirrors source paths)
    └── index/
        ├── core/                # Language-agnostic symbol + BM25 index
        ├── language/            # Per-language AST + embeddings (when applicable)
        │   ├── typescript/
        │   ├── python/
        │   ├── go/
        │   └── rust/
        ├── docs/
        │   └── markdown/
        └── data/
            └── json/
```

Each module stores per-file JSON under its subtree, mirroring your repository layout (for example, `index/language/typescript/src/auth/authService.json`).

### Example: TypeScript module layout

```
.raggrep/index/language/typescript/
├── manifest.json
├── symbolic/
│   ├── _meta.json
│   └── src/auth/authService.json   # File summary + keywords
├── literals/
│   └── _index.json
└── src/auth/
    └── authService.json            # Chunks + embeddings
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

### Exact Match Track

The exact match track provides grep-like search capabilities across ALL file types (not just AST-parsed code):

**When It Runs:**
- Query contains identifier patterns:
  - `SCREAMING_SNAKE_CASE`: `AUTH_SERVICE_URL`
  - `camelCase`: `getUserById`
  - `PascalCase`: `AuthService`
  - `snake_case`: `get_user_by_id`
  - `kebab-case`: `get-service-url`
- Query uses explicit quoting: `` `literal` `` or `"literal"`

**What It Does:**

| Step | Description |
| ----- | ----------- |
| 1. **Filesystem Walk** | Recursively walk directory (no index) |
| 2. **Filter Ignored** | Skip `node_modules`, `.git`, `dist`, etc. |
| 3. **Apply Path Filter** | Respect `--filter` options |
| 4. **Read Files** | Read content (skip binary, >1MB files) |
| 5. **Find Occurrences** | Search for literal, capture line numbers |
| 6. **Extract Context** | Get ±1 lines around each match |
| 7. **Sort by Count** | Most occurrences first |

**Domain Service: `simpleSearch.ts`**

Pure functions (no I/O):
- `isIdentifierQuery()`: Detects identifier patterns
- `extractSearchLiteral()`: Strips quotes, trims whitespace
- `findOccurrences()`: Finds all matches with context
- `searchFiles()`: Searches multiple files
- `extractIdentifiersFromContent()`: Identifies identifiers for indexing
- `isSearchableContent()`: Filters binary/large files

**Use Case: `exactSearch.ts`**

Orchestrates filesystem access and domain service:
- Accepts injected `FileSystem` dependency
- Implements directory walking logic
- Applies path filters with glob pattern matching
- Delegates to `searchFiles()` for actual searching

**Results Structure:**

```typescript
interface ExactMatchResults {
  query: string;                    // The literal searched for
  files: ExactMatchFile[];           // Files with matches
  totalMatches: number;               // Total matches across all files
  totalFiles: number;                // Files containing matches
  truncated: boolean;                // More matches exist beyond limit
}

interface ExactMatchFile {
  filepath: string;                 // Relative path
  occurrences: ExactMatchOccurrence[];  // Match locations
  matchCount: number;               // Total matches in this file
}

interface ExactMatchOccurrence {
  line: number;                    // Line number (1-indexed)
  column: number;                  // Column (0-indexed)
  lineContent: string;             // The full matching line
  contextBefore?: string;           // Line before match
  contextAfter?: string;            // Line after match
}
```

**Fusion Boosting:**

When exact matches are found, `hybridSearch()` multiplies fused **`score`** by **1.5** for semantic hits in those files and sets `context.exactMatchFusion`. After **`attachMatchScales()`**, it applies the same factor to **`structuredMatch`** so default structured-first ordering aligns with the displayed percentages. Final ordering uses **`SearchOptions.rankBy`** (see **Match scales & result ordering** above).

**Performance:**

| Metric | Value |
| ------- | ------ |
| Max files searched | 20 |
| Max occurrences/file | 5 |
| Max file size | 1MB |
| Binary detection | Null byte check |
| Ignored dirs | 12 (node_modules, .git, etc.) |

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
| `usecases/`  | Business logic orchestration with injected dependencies          |

**Hybrid ranking & weights**

| Location | Description |
| -------- | ----------- |
| `services/matchScales.ts` | Derives `semanticMatch` / `structuredMatch` and `compareSearchResultsByRankBy()` |
| `entities/rankingWeights.ts` | `RankingWeightsConfig`, defaults, and `mergeRankingWeights()` |

**Literal boosting & vocabulary:**

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
| `XenovaTransformersEmbeddingProvider` / `HuggingFaceTransformersEmbeddingProvider` | `EmbeddingProvider` | Transformers.js (`@xenova/*`, `@huggingface/*`) |
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
| `core`                | `src/modules/core/`                | Language-agnostic symbols + BM25                           |
| `language/typescript` | `src/modules/language/typescript/` | TS/JS AST, embeddings, literals, hybrid search              |
| `language/python`     | `src/modules/language/python/`     | Python (Tree-sitter)                                       |
| `language/go`         | `src/modules/language/go/`         | Go (Tree-sitter)                                           |
| `language/rust`       | `src/modules/language/rust/`       | Rust (Tree-sitter)                                         |
| `docs/markdown`       | `src/modules/docs/markdown/`       | Markdown chunking + hybrid search                          |
| `data/json`           | `src/modules/data/json/`           | JSON structure-aware index                                 |

Enabled modules are listed in config / manifest; search aggregates all enabled modules and sorts after match-scale attachment (see **Match scales & result ordering** above).

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
- [x] **Exact match track**: Grep-like search across all file types (YAML, .env, config) (v0.15.0)
- [x] **Fusion boosting**: Semantic results with exact matches get 1.5x boost (v0.15.0)
- [x] **Match scales & rankBy**: `semanticMatch` / `structuredMatch` display and `--rank-by structured|semantic|combined` ordering

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
