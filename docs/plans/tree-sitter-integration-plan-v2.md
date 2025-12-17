# Tree-sitter Integration Implementation Plan v2

**Date:** December 17, 2025  
**Status:** Planning  
**Goal:** Integrate tree-sitter for multi-language AST-based parsing with enhanced pre-processing pipeline

## Executive Summary

This plan outlines a comprehensive pre-processing pipeline that improves chunking quality, context awareness, and search flexibility through:

1. **Dynamic tree-sitter integration** for multi-language AST parsing
2. **README-aware context** linking files to documentation
3. **Multi-granularity markdown chunking** for hierarchical search
4. **Vocabulary extraction** from code symbols
5. **Synonym expansion** at both index and search time

**Key Principle:** Tree-sitter is infrastructure that feeds an enhanced pre-processing pipeline, which then feeds all three index types (symbolic, embedding, literal).

## Pre-Processing Pipeline

### 1. Identify Files to Index

**Purpose:** Determine which files need indexing (new or modified)

**Implementation:**

- Check index manifests for existing files
- Compare file mtimes and content hashes
- Group files by language/type for batch processing

**File:** `src/app/indexer/index.ts` (already implemented in `ensureIndexFresh()`)

**No changes needed** - current implementation already handles this efficiently.

---

### 2. Install Prerequisites

**Purpose:** Batch install tree-sitter grammars for all detected languages

**Current approach:** Install on-demand per file (can cause multiple pauses)

**New approach:** Scan and batch install upfront

**Changes:**

**File:** `src/app/indexer/index.ts` - `indexDirectory()`

**Add before module initialization:**

```typescript
// After finding files, before module loop
const detectedLanguages = detectLanguagesFromFiles(files);
await preInstallGrammars(detectedLanguages, logger);
```

**New function:** `detectLanguagesFromFiles()`

- Scan file extensions
- Map to tree-sitter language names
- Return unique set

**Enhancement to:** `src/infrastructure/parsing/grammarManager.ts`

- Add `preInstallBatch(languages: string[])` method
- Show progress: "Installing grammars: python, go, rust..."
- Handle failures gracefully (continue with available grammars)

**Rationale:** Better UX - one upfront installation instead of multiple pauses during indexing.

---

### 3. Introspection - README Context

**Purpose:** Link each file to its nearest README for contextual awareness

**Current state:**

- Path context extraction (implemented)
- Project structure detection (implemented)

**New addition:** README hierarchy traversal

**Changes:**

**File:** `src/domain/services/introspection.ts` - `introspectFile()`

**Add new field to `FileIntrospection`:**

```typescript
export interface FileIntrospection {
  // ... existing fields ...
  nearestReadme?: string; // Relative path to nearest README
}
```

**New function:** `findNearestReadme(filepath: string, rootDir: string): string | undefined`

**Algorithm:**

```
For file: src/auth/services/session.ts

Traverse up directory tree:
1. Check: src/auth/services/README.md
2. Check: src/auth/README.md
3. Check: src/README.md
4. Check: README.md (root)

Return first found, normalized relative to rootDir
```

**Usage in embedding generation:**

**File:** `src/modules/language/typescript/index.ts` (and other language modules)

When generating embeddings, prepend README context if available:

```typescript
const pathPrefix = formatPathContextForEmbedding(pathContext);
const readmeContext = introspection.nearestReadme
  ? `[See: ${introspection.nearestReadme}]`
  : "";

const chunkContents = parsedChunks.map((c) => {
  const namePrefix = c.name ? `${c.name}: ` : "";
  return `${readmeContext} ${pathPrefix} ${namePrefix}${c.content}`;
});
```

**Rationale:** README path provides semantic context without embedding full README content (which would be expensive and redundant).

---

### 4. Parse & Chunk (1 → Many)

**Purpose:** Convert files into searchable chunks at appropriate granularities

#### 4.1 Code Files

**Current approach:** Semantic chunks only (functions, classes)

**New approach:** Semantic chunks + full file chunk

**Changes:**

**File:** `src/modules/language/typescript/index.ts` (and other language modules)

**After parsing semantic chunks, add full file chunk:**

```typescript
const parsedChunks = parseTypeScriptCode(content, filepath);

// Add full file chunk for broad context
const fullFileChunk: ParsedChunk = {
  content: content,
  startLine: 1,
  endLine: content.split("\n").length,
  type: "file",
  name: path.basename(filepath),
  isExported: false,
};

const allChunks = [fullFileChunk, ...parsedChunks];
```

**Generate embeddings for all chunks** (including full file).

**Rationale:**

- Full file chunk captures broad context and relationships
- Semantic chunks provide targeted search
- Both are searchable, ranked by relevance

#### 4.2 Markdown Files - Multi-Granularity

**Current approach:** Single-level heading split

**New approach:** Hierarchical splitting with duplicates

**Changes:**

**File:** `src/modules/docs/markdown/index.ts`

**Replace current parsing with multi-granularity approach:**

**New function:** `parseMarkdownHierarchical(content: string): ParsedChunk[]`

**Algorithm:**

```
For markdown:
# H1 Title
## H2 Section
### H3 Subsection
#### H4 Detail

Create chunks:
1. H1 level: Full document (h1 + all h2, h3, h4 content)
2. H2 level: Each h2 section (h2 + its h3, h4 children)
3. H3 level: Each h3 section (h3 + its h4 children)
4. H4 level: Each h4 section (h4 content only)
5. H5 level: Each h5 section (h5 content only)

Each chunk includes:
- Heading text as name
- Full content including nested sections
- Proper line numbers
```

**Example:**

```markdown
# Project Overview (lines 1-100)

## Architecture (lines 10-50)

### Components (lines 20-40)
```

**Chunks created:**

1. `{name: "Project Overview", content: lines 1-100, type: "h1"}`
2. `{name: "Architecture", content: lines 10-50, type: "h2"}`
3. `{name: "Components", content: lines 20-40, type: "h3"}`

**Note:** Content is duplicated across granularities, but each serves different search purposes:

- H1: High-level overview queries
- H2: Section-specific queries
- H3/H4: Detailed queries

**Rationale:** Enables hierarchical search - users can find content at the right zoom level.

#### 4.3 All Files - Symbolic Index

**No change needed** - full text already stored in symbolic index for BM25.

---

### 5. Extract Literals & Vocabulary (1 → Many)

**Purpose:** Extract searchable identifiers and their component words

**Current approach:** Extract literals from chunk names

**New approach:** Extract literals + vocabulary from symbols

**Changes:**

**File:** `src/domain/services/literalExtractor.ts`

**Enhance `extractLiterals()` to also extract vocabulary:**

```typescript
export interface ExtractedLiteral {
  value: string; // Original: "getUserById"
  type: LiteralType;
  matchType: LiteralMatchType;
  vocabulary?: string[]; // NEW: ["get", "user", "by", "id"]
}
```

**New function:** `extractVocabulary(literal: string): string[]`

**Algorithm:**

```typescript
function extractVocabulary(literal: string): string[] {
  const words: string[] = [];

  // camelCase / PascalCase: split on capitals
  // getUserById → ["get", "User", "By", "Id"]
  const camelSplit = literal.split(/(?=[A-Z])/);

  // snake_case: split on underscores
  // get_user_by_id → ["get", "user", "by", "id"]
  const snakeSplit = literal.split("_");

  // kebab-case: split on hyphens
  // get-user-by-id → ["get", "user", "by", "id"]
  const kebabSplit = literal.split("-");

  // Combine and lowercase
  const allWords = [...camelSplit, ...snakeSplit, ...kebabSplit]
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 1); // Filter single chars

  return [...new Set(allWords)]; // Deduplicate
}
```

**Store in literal index:**

**File:** `src/infrastructure/storage/literalIndex.ts`

**Enhance `LiteralIndexEntry`:**

```typescript
interface LiteralIndexEntry {
  chunkId: string;
  filepath: string;
  originalCasing: string;
  type: LiteralType;
  matchType: LiteralMatchType;
  vocabulary: string[]; // NEW
}
```

**Search behavior:**

Query `"get user"` can match:

- Exact literal: `getUser` (high score)
- Vocabulary match: `getUserById` (medium score - 2/4 words)
- Vocabulary match: `fetchUserData` (lower score - 1/3 words with synonyms)

**Rationale:** Enables partial matching and bridges code conventions with natural language queries.

---

### 6. Synonym Expansion

**Purpose:** Improve search recall by expanding terms with synonyms

**Approach:** Dual expansion (index time + search time) with configurable levels

**Changes:**

#### 6.1 Index-Time Synonym Expansion

**File:** `src/domain/services/literalExtractor.ts`

**Add synonym expansion to vocabulary:**

```typescript
export interface SynonymExpansionConfig {
  enabled: boolean;
  level: "conservative" | "moderate" | "aggressive";
}

function expandVocabularyWithSynonyms(
  vocabulary: string[],
  config: SynonymExpansionConfig
): string[] {
  if (!config.enabled) return vocabulary;

  const expanded = new Set(vocabulary);

  for (const word of vocabulary) {
    const synonyms = getSynonyms(word, config.level);
    synonyms.forEach((s) => expanded.add(s));
  }

  return Array.from(expanded);
}
```

**Synonym levels:**

| Level        | Example | Expansion                                                |
| ------------ | ------- | -------------------------------------------------------- |
| Conservative | `get`   | `fetch`, `retrieve`                                      |
| Moderate     | `get`   | `fetch`, `retrieve`, `obtain`, `acquire`                 |
| Aggressive   | `get`   | `fetch`, `retrieve`, `obtain`, `acquire`, `read`, `load` |

**Store expanded vocabulary in literal index** for matching.

#### 6.2 Search-Time Synonym Expansion

**File:** `src/domain/services/queryLiteralParser.ts`

**Enhance query parsing to expand literals:**

```typescript
export function parseQueryLiterals(
  query: string,
  config?: SynonymExpansionConfig
): ParsedQuery {
  const detected = detectLiterals(query);

  // Expand each literal with synonyms
  const expandedLiterals = detected.literals.map((lit) => ({
    ...lit,
    synonyms: config?.enabled ? getSynonyms(lit.value, config.level) : [],
  }));

  return {
    literals: expandedLiterals,
    remainingQuery: detected.remainingQuery,
  };
}
```

**Matching logic:**

```typescript
// Query: "fetch user"
// Expands to: ["fetch", "get", "retrieve"] + ["user"]

// Matches:
// - getUserById (exact vocabulary match: "get" + "user")
// - fetchUserData (exact vocabulary match: "fetch" + "user")
// - retrieveUserInfo (synonym match: "retrieve" + "user")
```

**Configuration:**

**File:** `src/domain/entities/config.ts`

```typescript
export interface ModuleConfig {
  enabled: boolean;
  options?: {
    // ... existing options ...

    // NEW: Synonym expansion
    synonymExpansion?: {
      indexTime: SynonymExpansionConfig;
      searchTime: SynonymExpansionConfig;
    };
  };
}
```

**Default config:**

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

**Rationale:**

- Index-time: Conservative expansion keeps index size reasonable
- Search-time: More aggressive expansion improves recall
- Configurable levels allow tuning precision vs recall

---

## Indexing Phase

**Minimal changes** - existing indexing logic remains:

1. Generate embeddings for all chunks (including full file, multi-granularity markdown)
2. Build symbolic index (keywords, exports, README context)
3. Build literal index (literals + vocabulary + synonyms)
4. Build BM25 index (unchanged)

**Files affected:**

- Module `finalize()` methods handle index building
- No architectural changes needed

---

## Scoring Phase

**Minimal changes** - existing hybrid scoring remains:

```
Base Score = 0.7 × Semantic + 0.3 × BM25
Final Score = Base × LiteralMultiplier + Boosts
```

**Enhancements:**

**File:** `src/domain/services/literalScorer.ts`

**Add vocabulary matching to literal scoring:**

```typescript
function calculateLiteralMatch(
  queryLiteral: DetectedLiteral,
  indexedLiteral: ExtractedLiteral
): number {
  // Exact match (highest)
  if (queryLiteral.value === indexedLiteral.value) {
    return 1.0;
  }

  // Vocabulary overlap
  const queryVocab = extractVocabulary(queryLiteral.value);
  const indexedVocab = indexedLiteral.vocabulary || [];

  const overlap = queryVocab.filter((w) => indexedVocab.includes(w)).length;
  const total = Math.max(queryVocab.length, indexedVocab.length);

  return overlap / total; // 0.0 to 1.0
}
```

**Scoring tiers:**

- Exact match: 1.0 (multiplier 2.5×)
- High vocabulary overlap (>75%): 0.8 (multiplier 2.0×)
- Medium vocabulary overlap (>50%): 0.5 (multiplier 1.5×)
- Low vocabulary overlap (<50%): 0.3 (multiplier 1.2×)

---

## Implementation Phases

### Phase 1: Infrastructure (Week 1)

**Goal:** Set up tree-sitter infrastructure with dynamic grammar installation

**Tasks:**

1. Create parser ports (`src/domain/ports/parser.ts`)
2. Implement `GrammarManager` with batch installation
3. Implement `TreeSitterParser`
4. Implement `TypeScriptParser` wrapper
5. Add language detection and parser factory

**Deliverables:**

- Parser infrastructure ready
- Batch grammar installation working
- Tests passing

---

### Phase 2: Enhanced Pre-Processing (Week 2)

**Goal:** Implement README context, vocabulary extraction, synonym expansion

**Tasks:**

1. Add README traversal to introspection
2. Enhance literal extractor with vocabulary extraction
3. Implement synonym expansion (index + search time)
4. Add vocabulary to literal index storage
5. Update scoring to use vocabulary matching

**Deliverables:**

- README context working
- Vocabulary extraction working
- Synonym expansion configurable
- Tests passing

---

### Phase 3: Multi-Granularity Chunking (Week 2-3)

**Goal:** Implement full file chunks and hierarchical markdown

**Tasks:**

1. Add full file chunk to code modules
2. Implement hierarchical markdown parsing
3. Update embedding generation for all chunk types
4. Test with various markdown structures

**Deliverables:**

- Full file chunks searchable
- Hierarchical markdown working
- Quality improvements measurable

---

### Phase 4: Language Modules (Week 3-4)

**Goal:** Add Python, Go, Rust modules using tree-sitter

**Tasks:**

1. Create Python module with tree-sitter
2. Create Go module with tree-sitter
3. Create Rust module with tree-sitter
4. Test with real codebases
5. Compare quality vs Core module

**Deliverables:**

- Multi-language support
- Consistent quality across languages
- Performance benchmarks

---

### Phase 5: Polish & Documentation (Week 5)

**Goal:** Production-ready release

**Tasks:**

1. Error handling and graceful fallbacks
2. Performance optimization
3. Complete documentation
4. End-to-end testing

**Deliverables:**

- Production-ready release
- Complete documentation
- Migration guide

---

## Key Architectural Decisions

| Decision                       | Rationale                                               |
| ------------------------------ | ------------------------------------------------------- |
| **Full file chunks**           | Separately searchable for broad context queries         |
| **Hierarchical markdown**      | Different granularities serve different search needs    |
| **README context as path**     | Lightweight context without embedding full READMEs      |
| **Vocabulary extraction**      | Bridges code conventions and natural language           |
| **Dual synonym expansion**     | Conservative at index time, aggressive at search time   |
| **Batch grammar installation** | Better UX - one upfront cost instead of multiple pauses |

---

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

---

## Success Metrics

| Metric               | Target                            | Measurement          |
| -------------------- | --------------------------------- | -------------------- |
| Search recall        | >85% relevant results             | Test query set       |
| Vocabulary matching  | >70% partial matches work         | Test symbol queries  |
| Markdown granularity | Users find content at right level | User feedback        |
| README context       | Improves relevance scoring        | A/B testing          |
| Index size           | <2× increase vs current           | Measure index files  |
| Indexing speed       | <20% slower vs current            | Benchmark 1000 files |

---

## Open Questions

1. **Vocabulary index size:** With vocabulary expansion, literal index may grow significantly. Should we:

   - a) Index all vocabulary (comprehensive but large)
   - b) Index only common words (smaller but may miss rare terms)
   - c) Use bloom filter for vocabulary (space-efficient but probabilistic)

2. **Full file chunk weight:** Should full file chunks be:

   - a) Weighted equally with semantic chunks
   - b) Weighted lower (prefer targeted results)
   - c) Only used for broad queries (query intent detection)

3. **Markdown duplication:** With hierarchical chunking, content is duplicated. Should we:

   - a) Accept duplication (comprehensive coverage)
   - b) Deduplicate embeddings (save space but lose granularity)
   - c) Use chunk type weighting (prefer specific over general)

4. **Synonym quality:** How to maintain synonym dictionary?
   - a) Hardcoded lists (simple but limited)
   - b) Load from external file (flexible but requires maintenance)
   - c) Learn from usage patterns (adaptive but complex)

---

## Next Steps

1. Review and approve this plan
2. Clarify open questions
3. Begin Phase 1: Infrastructure setup
4. Iterate based on feedback and metrics
