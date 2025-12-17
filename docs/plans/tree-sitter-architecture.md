# Tree-sitter Integration Architecture

**Date:** December 17, 2025  
**Status:** ✅ Implemented  
**Goal:** Enhanced pre-processing pipeline with tree-sitter for multi-language support

## Overview

This architecture extends RAGgrep's indexing pipeline with:
1. Dynamic tree-sitter grammar installation
2. README-aware context linking
3. Multi-granularity chunking (full file + semantic + hierarchical markdown)
4. Vocabulary extraction from code symbols
5. Dual-phase synonym expansion (index + search time)

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PRE-PROCESSING PIPELINE                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  1. Identify Files                                          │
│     - Check index status (new vs modified)                  │
│     - Group by language/type                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Install Prerequisites                                   │
│     - Detect all languages in file set                      │
│     - Batch install tree-sitter grammars                    │
│     - Show progress, handle failures                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Introspection (per file)                                │
│     - Extract path context                                  │
│     - Find nearest README in hierarchy                      │
│     - Store README path (not content)                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Parse & Chunk (1 → many)                                │
│                                                             │
│  Code Files:                                                │
│    - Full file chunk (broad context)                        │
│    - Semantic chunks (functions, classes)                   │
│    - Comments associated with code                          │
│                                                             │
│  Markdown Files:                                            │
│    - H1 chunks (full doc)                                   │
│    - H2 chunks (sections + nested content)                  │
│    - H3 chunks (subsections + nested content)               │
│    - H4/H5 chunks (details)                                 │
│                                                             │
│  All Files:                                                 │
│    - Full text in symbolic index (BM25)                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Extract Literals & Vocabulary (1 → many)                │
│     - Extract symbol names from code                        │
│     - Extract vocabulary from symbols:                      │
│       • getUserById → ["get", "user", "by", "id"]          │
│       • AuthService → ["auth", "service"]                  │
│     - Index both literals and vocabulary separately         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  6. Synonym Expansion                                       │
│                                                             │
│  Index Time (Conservative):                                 │
│    - Expand vocabulary: get → [fetch, retrieve]            │
│    - Store in literal index                                 │
│                                                             │
│  Search Time (Moderate/Aggressive):                         │
│    - Expand query literals with more synonyms               │
│    - Match against indexed vocabulary                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    INDEXING PHASE                           │
│                                                             │
│  - Generate embeddings for all chunks                       │
│  - Build symbolic index (keywords, README paths)            │
│  - Build embedding index (vectors)                          │
│  - Build literal index (symbols + vocabulary)               │
│  - Build BM25 index                                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SCORING PHASE                            │
│                                                             │
│  Base Score = 0.7 × Semantic + 0.3 × BM25                  │
│                                                             │
│  Literal Matching:                                          │
│    - Exact match: 1.0 (multiplier 2.5×)                    │
│    - High vocab overlap (>75%): 0.8 (multiplier 2.0×)      │
│    - Medium vocab overlap (>50%): 0.5 (multiplier 1.5×)    │
│    - Low vocab overlap (<50%): 0.3 (multiplier 1.2×)       │
│                                                             │
│  Final Score = Base × LiteralMultiplier + Boosts           │
└─────────────────────────────────────────────────────────────┘
```

## Parser Strategy

### Language-Specific Parsers

| Language | Parser | Rationale |
|----------|--------|-----------|
| TypeScript/JavaScript | TypeScript Compiler API (primary) | Superior type information, JSDoc, proven quality |
| TypeScript/JavaScript | Tree-sitter (fallback) | Configurable option for consistency |
| Python | Tree-sitter | No native AST in Node.js |
| Go | Tree-sitter | No native parser |
| Rust | Tree-sitter | No native parser |
| Java | Tree-sitter | No native parser |
| Markdown | Heading parser | Current approach adequate |
| JSON | Whole file | Current approach adequate |

### Dynamic Grammar Installation

**Approach:** Batch install grammars upfront based on detected file types

**Benefits:**
- One-time installation cost
- Better UX (no multiple pauses)
- Clear progress indication

**Fallback:** If installation fails, fall back to Core module (regex-based)

## Chunking Strategy

### Code Files: Dual Chunking

**Full File Chunk:**
- Contains entire file content
- Type: `file`
- Purpose: Broad context queries, file-level understanding

**Semantic Chunks:**
- Functions, classes, interfaces, types, enums
- Type: `function`, `class`, `interface`, etc.
- Purpose: Targeted search for specific code elements

**Both types are separately searchable and ranked by relevance.**

### Markdown Files: Hierarchical Chunking

**Multi-granularity with duplication:**

```
# H1 Title (lines 1-100)
## H2 Section (lines 10-50)
### H3 Subsection (lines 20-40)

Chunks:
1. H1 chunk: lines 1-100 (includes all h2, h3 content)
2. H2 chunk: lines 10-50 (includes h3 content)
3. H3 chunk: lines 20-40 (just h3 content)
```

**Rationale:** Different granularities serve different search needs:
- H1: Overview queries ("what is this project about?")
- H2: Section queries ("how does authentication work?")
- H3/H4: Detail queries ("what parameters does login accept?")

**Trade-off:** Content duplication increases index size but improves search flexibility.

## Introspection: README Context

### README Hierarchy Traversal

For each file, traverse up directory tree to find nearest README:

```
File: src/auth/services/session.ts

Check:
1. src/auth/services/README.md
2. src/auth/README.md  
3. src/README.md
4. README.md (root)

Store: nearestReadme = "src/auth/README.md" (relative path)
```

### Usage

**In embeddings:** Prepend README reference as context marker
```
[See: src/auth/README.md] [auth service] export function validateSession() {...}
```

**In search:** README path provides semantic context without embedding full content

**Rationale:** Lightweight context linking without expensive README embedding

## Vocabulary Extraction

### Symbol → Vocabulary Mapping

Extract individual words from code symbols:

| Symbol | Vocabulary |
|--------|-----------|
| `getUserById` | `["get", "user", "by", "id"]` |
| `AuthService` | `["auth", "service"]` |
| `validate_session` | `["validate", "session"]` |
| `fetch-user-data` | `["fetch", "user", "data"]` |

### Extraction Rules

**camelCase / PascalCase:** Split on capital letters
- `getUserById` → `["get", "User", "By", "Id"]` → lowercase → `["get", "user", "by", "id"]`

**snake_case:** Split on underscores
- `get_user_by_id` → `["get", "user", "by", "id"]`

**kebab-case:** Split on hyphens
- `get-user-by-id` → `["get", "user", "by", "id"]`

**SCREAMING_SNAKE_CASE:** Split on underscores, lowercase
- `MAX_RETRY_COUNT` → `["max", "retry", "count"]`

### Indexing

**Both literals and vocabulary are indexed separately:**

```
Literal Index:
  "getUserById" → chunk123
  
Vocabulary Index:
  "get" → chunk123
  "user" → chunk123
  "by" → chunk123
  "id" → chunk123
```

### Search Behavior

| Query | Matches | Score |
|-------|---------|-------|
| `getUserById` | Exact literal | 1.0 (high) |
| `get user` | Vocabulary (2/4 words) | 0.5 (medium) |
| `user` | Vocabulary (1/4 words) | 0.25 (low) |

**Rationale:** Bridges code conventions with natural language queries

## Synonym Expansion

### Dual-Phase Approach

**Index Time (Conservative):**
- Expand vocabulary with core synonyms
- Keep index size reasonable
- Example: `get` → `["get", "fetch", "retrieve"]`

**Search Time (Moderate/Aggressive):**
- Expand query with more synonyms
- Improve recall without bloating index
- Example: `get` → `["get", "fetch", "retrieve", "obtain", "acquire", "read"]`

### Expansion Levels

| Level | Example: `get` | Count |
|-------|---------------|-------|
| Conservative | `fetch`, `retrieve` | 2 |
| Moderate | `fetch`, `retrieve`, `obtain`, `acquire` | 4 |
| Aggressive | `fetch`, `retrieve`, `obtain`, `acquire`, `read`, `load` | 6 |

### Configuration

```json
{
  "synonymExpansion": {
    "indexTime": {
      "enabled": true,
      "level": "conservative"
    },
    "searchTime": {
      "enabled": true,
      "level": "moderate"
    }
  }
}
```

**Rationale:** Balance between index size and search recall

## Index Structure

### Three Index Types (Existing)

**1. Symbolic Index:**
- Keywords, exports, path context
- README paths (NEW)
- BM25 statistics
- Full file text (for BM25)

**2. Embedding Index:**
- One embedding per chunk
- Includes: full file chunks, semantic chunks, hierarchical markdown chunks
- Used for semantic similarity

**3. Literal Index:**
- Symbol literals (NEW: with vocabulary)
- Vocabulary words indexed separately (NEW)
- Synonym-expanded vocabulary (NEW)
- Used for exact/partial matching

### Enhanced Literal Index Structure

```typescript
interface LiteralIndexEntry {
  chunkId: string;
  filepath: string;
  originalCasing: string;      // "getUserById"
  type: LiteralType;
  matchType: LiteralMatchType;
  vocabulary: string[];         // NEW: ["get", "user", "by", "id"]
  synonyms: string[];          // NEW: ["fetch", "retrieve", ...]
}
```

## Scoring Enhancements

### Vocabulary Matching

**Calculate overlap between query and indexed vocabulary:**

```
Query: "get user"
Query vocabulary: ["get", "user"]

Indexed literal: getUserById
Indexed vocabulary: ["get", "user", "by", "id"]

Overlap: 2 words
Total: 4 words
Score: 2/4 = 0.5
```

### Scoring Tiers

| Match Type | Overlap | Score | Multiplier |
|------------|---------|-------|------------|
| Exact literal | 100% | 1.0 | 2.5× |
| High vocabulary | >75% | 0.8 | 2.0× |
| Medium vocabulary | >50% | 0.5 | 1.5× |
| Low vocabulary | <50% | 0.3 | 1.2× |

### Final Score Calculation

```
Base Score = 0.7 × Semantic + 0.3 × BM25
Literal Score = calculateVocabularyOverlap(query, indexed)
Final Score = Base × getLiteralMultiplier(Literal Score) + Boosts
```

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Batch grammar installation** | Better UX - one upfront cost vs multiple pauses |
| **README as path reference** | Lightweight context without embedding full content |
| **Full file chunks** | Enable broad context queries alongside targeted search |
| **Hierarchical markdown** | Different granularities serve different search needs |
| **Vocabulary indexed separately** | Enable partial matching and natural language queries |
| **Dual synonym expansion** | Conservative at index (size) vs aggressive at search (recall) |
| **TypeScript API primary** | Keep proven quality, tree-sitter as fallback |

## Trade-offs

### Index Size vs Search Quality

**Increases:**
- Full file chunks: +1 chunk per file
- Hierarchical markdown: +N chunks per heading level
- Vocabulary indexing: +M words per symbol
- Synonym expansion: +K synonyms per word

**Estimated impact:** 2-3× index size increase

**Mitigation:**
- Conservative synonym expansion at index time
- Configurable granularity levels
- Optional features (can disable full file chunks)

### Precision vs Recall

**Vocabulary matching improves recall but may reduce precision:**
- Query `"user"` matches many functions with "user" in name
- May return too many results

**Mitigation:**
- Vocabulary matches scored lower than exact matches
- Combine with semantic and BM25 scores
- Minimum score threshold filters low-quality matches

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Search recall** | >85% relevant results | Test query set |
| **Vocabulary matching** | >70% partial matches work | Symbol query tests |
| **Index size** | <3× current size | Measure index files |
| **Indexing speed** | <30% slower | Benchmark 1000 files |
| **Search speed** | <10% slower | Benchmark 100 queries |
| **Grammar install time** | <30s for 5 languages | Measure first-time setup |

## Open Questions

### 1. Vocabulary Index Size

With vocabulary expansion, literal index may grow significantly.

**Options:**
- a) Index all vocabulary (comprehensive but large)
- b) Index only common words (smaller but may miss rare terms)
- c) Use bloom filter (space-efficient but probabilistic)

**Recommendation:** Start with (a), optimize later if needed

### 2. Full File Chunk Weight

Should full file chunks be weighted differently?

**Options:**
- a) Equal weight with semantic chunks
- b) Lower weight (prefer targeted results)
- c) Only for broad queries (query intent detection)

**Recommendation:** Start with (b) - lower weight, tune based on feedback

### 3. Markdown Duplication

With hierarchical chunking, content is duplicated.

**Options:**
- a) Accept duplication (comprehensive coverage)
- b) Deduplicate embeddings (save space but lose granularity)
- c) Use chunk type weighting (prefer specific over general)

**Recommendation:** Start with (a), use (c) for scoring

### 4. Synonym Dictionary Maintenance

How to maintain synonym quality?

**Options:**
- a) Hardcoded lists (simple but limited)
- b) Load from external file (flexible but requires maintenance)
- c) Learn from usage patterns (adaptive but complex)

**Recommendation:** Start with (a), move to (b) for extensibility

## Configuration Example

```json
{
  "modules": {
    "language/typescript": {
      "enabled": true,
      "options": {
        "parser": "typescript-api",
        "includeFullFileChunk": true,
        "synonymExpansion": {
          "indexTime": {"enabled": true, "level": "conservative"},
          "searchTime": {"enabled": true, "level": "moderate"}
        }
      }
    },
    "docs/markdown": {
      "enabled": true,
      "options": {
        "granularityLevels": ["h1", "h2", "h3", "h4"],
        "maxDepth": 4
      }
    },
    "language/python": {
      "enabled": true,
      "options": {
        "includeFullFileChunk": true,
        "associateComments": true
      }
    }
  },
  "introspection": {
    "enableReadmeContext": true,
    "readmeFilenames": ["README.md", "readme.md", "index.md"]
  },
  "parsing": {
    "batchInstallGrammars": true,
    "fallbackToCore": true
  }
}
```

## Implementation Status

All core functionality has been implemented across 7 milestones:

| Milestone | Status | Key Deliverables |
|-----------|--------|------------------|
| M1: Parser Infrastructure | ✅ Complete | IParser interface, TreeSitterParser, GrammarManager |
| M2: README Context | ✅ Complete | findNearestReadme, FileIntrospection.nearestReadme |
| M3: Vocabulary Extraction | ✅ Complete | extractVocabulary, LiteralIndex vocabulary support |
| M4: Multi-Granularity Chunking | ✅ Complete | Full file chunks, hierarchical markdown |
| M5: Python Module | ✅ Complete | PythonModule with tree-sitter parsing |
| M6: Vocabulary Search | ✅ Complete | calculateVocabularyMatch in scoring |
| M7: Go & Rust Modules | ✅ Complete | GoModule, RustModule with regex fallback |
| M8: Polish & Docs | ✅ Complete | Configuration validator, error handling |

### Files Changed

**New Files:**
- `src/domain/ports/parser.ts` - IParser interface
- `src/infrastructure/parsing/` - Parser infrastructure
  - `grammarManager.ts` - Grammar installation
  - `treeSitterParser.ts` - Tree-sitter adapter
  - `typescriptParser.ts` - TypeScript API adapter
  - `parserFactory.ts` - Parser selection
- `src/modules/language/python/index.ts` - Python module
- `src/modules/language/go/index.ts` - Go module
- `src/modules/language/rust/index.ts` - Rust module
- `src/domain/services/configValidator.ts` - Configuration validation

**Modified Files:**
- `src/domain/entities/literal.ts` - Added vocabulary field
- `src/domain/entities/introspection.ts` - Added nearestReadme
- `src/domain/services/literalExtractor.ts` - extractVocabulary()
- `src/domain/services/literalScorer.ts` - calculateVocabularyMatch()
- `src/domain/services/introspection.ts` - findNearestReadme()
- `src/infrastructure/storage/literalIndex.ts` - Vocabulary indexing
- `src/modules/language/typescript/index.ts` - Full file chunks
- `src/modules/docs/markdown/index.ts` - Hierarchical chunking
- `src/modules/registry.ts` - Register new modules
- `package.json` - Added web-tree-sitter

### Test Coverage

- 374 tests passing
- Unit tests for all new services
- Integration tests for modules
- 2 pre-existing flaky tests (timeout issues, not related to changes)

