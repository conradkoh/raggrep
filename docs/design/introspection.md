# Introspection & Multi-Index Architecture

> **Status**: Implemented (Clean Architecture)  
> **Created**: 2025-11-28  
> **Last Updated**: 2025-12-03

## Implementation Status

| Component             | Status         | Location                                   |
| --------------------- | -------------- | ------------------------------------------ |
| Core Index            | ✅ Implemented | `src/modules/core/`                        |
| TypeScript Index      | ✅ Implemented | `src/modules/language/typescript/`         |
| Introspection Types   | ✅ Implemented | `src/domain/entities/introspection.ts`     |
| Convention Types      | ✅ Implemented | `src/domain/entities/conventions.ts`       |
| Introspection Service | ✅ Implemented | `src/domain/services/introspection.ts`     |
| Convention Service    | ✅ Implemented | `src/domain/services/conventions/`         |
| Project Detection     | ✅ Implemented | `src/infrastructure/introspection/`        |
| IntrospectionIndex    | ✅ Implemented | `src/infrastructure/introspection/`        |
| Path Context Boosting | ✅ Implemented | Used in TypeScript module search           |
| Framework Detection   | ✅ Implemented | Next.js, Convex conventions                |
| Language Conventions  | ✅ Implemented | Go, Python entry points and config files   |
| Contribution Tracking | ✅ Implemented | Module attribution shown in search results |
| Embedding Models      | ✅ Implemented | bge-small (default), nomic-embed-text      |
| Literal Boosting      | ✅ Implemented | Exact identifier matching with multipliers |

## Overview

This document outlines RAGgrep's multi-index system with shared introspection. The architecture separates concerns:

1. **Introspection** - Shared metadata extraction (path, project, scope)
2. **Core Index** - Language-agnostic text processing
3. **Language Indexes** - Language-specific deep analysis (TypeScript, Python, etc.)

## Motivation

### Problem: Context Matters

The same file name means different things based on where it lives:

| Path                         | Interpretation                        |
| ---------------------------- | ------------------------------------- |
| `backend/services/server.ts` | Core API server, high importance      |
| `apps/webapp/server.ts`      | Next.js server entry, frontend-ish    |
| `packages/shared/server.ts`  | Shared server utilities               |
| `scripts/dev-server.ts`      | Dev tooling, low production relevance |

### Current Limitations

- Single `semantic` module does everything
- Path context is extracted but not systematically shared
- No separation between fast/simple and slow/deep indexing
- Hard to add new language support

## Architecture

### 3-Layer Design

```
┌─────────────────────────────────────────────────────────────┐
│              INTROSPECTION (Shared Metadata)                 │
│  • File path → project, scope, layer, domain                │
│  • Monorepo detection (apps/, packages/, services/)         │
│  • Language/framework detection                              │
└─────────────────────────────┬───────────────────────────────┘
                              │ provides context to
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────┐
│      CORE INDEX         │     │    LANGUAGE INDEXES         │
│                         │     │                             │
│  • Symbol extraction    │     │  typescript/                │
│    (regex-based)        │     │  ├── AST parsing            │
│  • BM25 text search     │     │  ├── Type extraction        │
│  • Fast, deterministic  │     │  ├── Semantic embeddings    │
│                         │     │  ├── BM25 keyword scoring   │
│  Works on ANY file      │     │  └── Export/import tracking │
│                         │     │                             │
│                         │     │  python/ (future)           │
│                         │     │  rust/ (future)             │
└─────────────────────────┘     └─────────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  SEARCH AGGREGATOR                           │
│  • Merges results from all indexes                          │
│  • Applies hybrid scoring (semantic + BM25 + boosts)        │
│  • Tracks module contributions                               │
└─────────────────────────────────────────────────────────────┘
```

### Folder Structure

```
/tmp/raggrep-indexes/<hash>/
├── config.json
├── manifest.json
│
├── introspection/              # SHARED - computed once, used by all
│   ├── _project.json           # Detected project structure
│   └── files/
│       └── backend/
│           └── services/
│               └── server.json # Per-file metadata
│
└── index/
    ├── core/                   # Language-agnostic text index
    │   ├── manifest.json
    │   └── files/...
    │
    └── language/               # Language-specific indexes
        └── typescript/
            ├── manifest.json
            ├── symbolic/       # BM25 file filtering
            └── files/...       # Embeddings
```

## Introspection Layer

### Purpose

Extract and store metadata about each file that can be used by any index for context-aware scoring.

### Schema

```typescript
interface FileIntrospection {
  filepath: string;

  // Project context (from folder structure or package.json)
  project: {
    name: string; // "webapp" | "api-server"
    root: string; // "apps/webapp"
    type: "app" | "library" | "service" | "script" | "unknown";
  };

  // Scope detection
  scope: "frontend" | "backend" | "shared" | "tooling" | "unknown";

  // Architecture (existing path context)
  layer?: string; // "controller" | "service" | "repository"
  domain?: string; // "auth" | "users" | "payments"

  // Language info
  language: string; // "typescript" | "javascript" | "python"
  framework?: string; // "nextjs" | "express" | "fastify"
}
```

### Project Detection

Auto-detect monorepo patterns:

| Pattern      | Project Type | Scope   |
| ------------ | ------------ | ------- |
| `apps/*`     | app          | varies  |
| `packages/*` | library      | shared  |
| `services/*` | service      | backend |
| `scripts/*`  | script       | tooling |
| `libs/*`     | library      | shared  |

### Configuration Override

Users can override auto-detection in config.json:

```json
{
  "introspection": {
    "projects": {
      "apps/webapp": { "scope": "frontend", "framework": "nextjs" },
      "apps/api": { "scope": "backend", "framework": "express" }
    }
  }
}
```

## Core Index

### Purpose

Fast, language-agnostic text search. Works on any file type.

### Features

- **Symbol extraction** via regex (function names, class names)
- **BM25 tokenization** for keyword search
- **No embeddings** - deterministic, fast
- **Sub-millisecond** per file processing

### Implementation

```typescript
interface CoreIndexEntry {
  filepath: string;

  // Extracted symbols (regex-based)
  symbols: {
    name: string;
    type: "function" | "class" | "variable" | "other";
    line: number;
  }[];

  // BM25 tokens
  tokens: string[];
  tokenFrequencies: Record<string, number>;

  // Basic chunking
  chunks: {
    id: string;
    content: string;
    startLine: number;
    endLine: number;
  }[];
}
```

### Symbol Extraction Patterns

```typescript
const SYMBOL_PATTERNS = {
  function: /\b(?:function|async\s+function)\s+(\w+)/g,
  class: /\bclass\s+(\w+)/g,
  const: /\b(?:const|let|var)\s+(\w+)\s*=/g,
  export: /\bexport\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g,
};
```

## Language Indexes

### Purpose

Deep, language-specific analysis with semantic understanding.

### TypeScript Index (`language/typescript/`)

- **AST parsing** via TypeScript Compiler API
- **Type extraction** - interfaces, types, generics
- **Semantic embeddings** - natural language understanding
- **Export/import tracking** - module relationships
- **JSDoc extraction** - documentation context

### Embedding Models

The TypeScript module supports multiple embedding models:

| Model                     | Dimensions | Size   | Notes                              |
| ------------------------- | ---------- | ------ | ---------------------------------- |
| `bge-small-en-v1.5`       | 384        | ~33MB  | **Default**, best balance for code |
| `nomic-embed-text-v1.5`   | 768        | ~270MB | Higher quality, larger             |
| `all-MiniLM-L6-v2`        | 384        | ~23MB  | Fast, good general purpose         |
| `all-MiniLM-L12-v2`       | 384        | ~33MB  | Higher quality than L6             |
| `paraphrase-MiniLM-L3-v2` | 384        | ~17MB  | Fastest, lower quality             |

### Future Language Support

The architecture supports adding:

- `language/python/` - AST via Python parser
- `language/rust/` - AST via rust-analyzer
- `language/go/` - AST via go/parser

Each language module implements the same interface:

```typescript
interface LanguageModule {
  id: string; // "typescript"
  extensions: string[]; // [".ts", ".tsx"]
  version: string; // "1.0.0"

  indexFile(filepath: string, content: string): Promise<LanguageIndexEntry>;
  search(query: string, options: SearchOptions): Promise<SearchResult[]>;
}
```

## Search & Result Aggregation

### Contribution Tracking

Each search result identifies which module produced it:

```typescript
interface SearchResult {
  filepath: string;
  chunk: Chunk;
  score: number;

  // Which module produced this result
  moduleId: string; // "core" | "language/typescript" | etc.

  // Optional: detailed score breakdown for debugging
  context?: {
    semanticScore?: number; // Embedding similarity (TypeScript module)
    bm25Score?: number; // BM25 keyword match
    pathBoost?: number; // Path context boost
    fileTypeBoost?: number; // File type relevance boost
    chunkTypeBoost?: number; // Chunk type boost (function > block)
    exportBoost?: number; // Exported symbols boost
    // Literal boosting context
    literalMultiplier?: number; // Score multiplier from literal match
    literalMatchType?: string; // "definition" | "reference" | "import"
    literalConfidence?: string; // "high" | "medium" | "low"
    literalMatchCount?: number; // Number of literal matches
    literalOnly?: boolean; // True if found only via literal index
  };
}
```

When displaying results, the CLI shows the contributing module:

```
1. src/auth/login.ts:10-25 (handleLogin)
   Score: 85.2% | Type: function | via TypeScript | exported
```

### Hybrid Scoring (TypeScript Module)

The TypeScript module uses a hybrid scoring approach with literal boosting:

```typescript
// Weights
const SEMANTIC_WEIGHT = 0.7; // Embedding similarity
const BM25_WEIGHT = 0.3; // Keyword matching

// Base score calculation
const baseScore =
  SEMANTIC_WEIGHT * semanticScore +
  BM25_WEIGHT * bm25Score;

// Apply literal multiplier (1.0 if no match, up to 2.5 for exact definition match)
const boostedScore = baseScore * literalMultiplier;

// Final score with additive boosts
const finalScore =
  boostedScore +
  pathBoost + // +0.1 for domain match, +0.05 for layer/segment match
  fileTypeBoost + // Boost for source vs docs
  chunkTypeBoost + // +0.05 for functions, +0.04 for classes, etc.
  exportBoost; // +0.03 for exported symbols
```

The semantic score dominates (70%) because it captures meaning and intent,
while BM25 (30%) ensures exact keyword matches are not overlooked.
Literal boosting applies a multiplicative factor when query terms exactly match
identifier names (class names, function names, etc.).

### Context-Aware Boosting

```typescript
function calculateContextBoost(
  introspection: FileIntrospection,
  query: string
): number {
  let boost = 0;
  const queryTerms = query.toLowerCase().split(/\s+/);

  // Domain match: +10%
  if (
    introspection.domain &&
    queryTerms.some((t) => introspection.domain!.includes(t))
  ) {
    boost += 0.1;
  }

  // Layer match: +5%
  if (
    introspection.layer &&
    queryTerms.some((t) => introspection.layer!.includes(t))
  ) {
    boost += 0.05;
  }

  // Scope match (backend queries boost backend files): +5%
  if (
    queryTerms.some((t) =>
      ["api", "server", "backend", "endpoint"].includes(t)
    ) &&
    introspection.scope === "backend"
  ) {
    boost += 0.05;
  }

  return boost;
}
```

## Implementation Plan

### Phase 1: Restructure ✅ Complete

1. ✅ Reorganized folder structure:
   - `index/core/`
   - `index/language/typescript/`
2. ✅ Updated module paths and references
3. ✅ Maintained backward compatibility

### Phase 2: Core Index ✅ Complete

1. ✅ Created `CoreModule` with regex-based symbol extraction
2. ✅ Implemented BM25 tokenization
3. ✅ Added line-based chunking with overlap
4. ✅ Both modules run during indexing, results merged at search

### Phase 3: Introspection Layer ✅ Complete

1. ✅ Created `introspection/` folder structure
2. ✅ Implemented project/monorepo detection
3. ✅ Implemented path context extraction (layer, domain, segments)
4. ✅ Connected to search boosting in TypeScript module
5. ✅ Framework detection (Next.js, Convex, etc.)
6. ✅ Language conventions (Go, Python entry points)

### Phase 4: Contribution Tracking ✅ Complete

1. ✅ Each `SearchResult` includes `moduleId` identifying the contributing module
2. ✅ Search results display which module contributed each result (e.g., "via TypeScript", "via Core")
3. ✅ Internal score tracking in `context` field for debugging (semanticScore, bm25Score, pathBoost)

### Phase 5: Embedding Model Improvements ✅ Complete

1. ✅ Changed default model from `all-MiniLM-L6-v2` to `bge-small-en-v1.5` (~10% better on MTEB)
2. ✅ Added `nomic-embed-text-v1.5` (768 dimensions) for higher quality
3. ✅ Dynamic dimension support per model
4. ✅ Index schema version bump (1.0.0 → 1.1.0) to invalidate old indexes

### Phase 6: Learning & Tuning ❌ Not Started

1. Collect contribution data over time
2. Analyze which indexes/boosts are most effective
3. Allow weight customization
4. Consider ML-based weight optimization

## Open Questions

1. **Introspection caching** - Should we cache introspection in memory during search, or load per-file?

2. **Partial indexing** - Should `core` and `typescript` indexes be built independently, allowing partial rebuilds?

3. **Result deduplication** - When both indexes find the same chunk, how do we merge vs deduplicate?

4. **Contribution logging** - Should we log to a file, or only show in verbose mode?

## References

- Current architecture: [docs/architecture.md](../architecture.md)
- Path-aware indexing: Already implemented in `parsePathContext()`
- BM25 implementation: `src/domain/services/bm25.ts`
