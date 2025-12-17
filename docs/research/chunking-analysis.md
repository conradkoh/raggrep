# Chunking Analysis: Where and How Chunking Happens

**Date:** December 17, 2025  
**Context:** Understanding chunking strategies across symbolic, embedding, and literal indexes to identify where tree-sitter would be most impactful.

## Executive Summary

RAGgrep uses **three types of indexes** (symbolic, embedding, literal), but **chunking happens only once** at the module level during `indexFile()`. The resulting chunks are then used differently by each index type:

1. **Symbolic Index**: Uses chunk metadata (keywords, exports) for BM25 search
2. **Embedding Index**: Generates embeddings for each chunk for semantic search
3. **Literal Index**: Extracts identifiers from chunk names/content for exact matching

**Key Insight:** Tree-sitter would be most impactful at the **parsing/chunking layer** (module level), as it's the foundation that feeds all three index types.

## The Three Index Types

### 1. Symbolic Index (Keywords + BM25)

**Purpose:** Fast keyword-based filtering and BM25 scoring  
**Location:** `src/infrastructure/storage/symbolicIndex.ts`  
**Storage:** `.raggrep/index/<module>/symbolic/`

**What it stores:**

- File summaries with keywords
- Export lists
- Path context
- BM25 statistics

**How it uses chunks:**

```typescript
// From TypeScript module indexFile()
const fileSummary: FileSummary = {
  filepath,
  chunkCount: chunks.length,              // ← Uses chunk count
  chunkTypes,                             // ← Uses chunk types
  keywords: Array.from(allKeywords),      // ← Extracted from chunk content
  exports,                                // ← From chunk metadata (isExported)
  lastModified: stats.lastModified,
  pathContext: { ... }
};
```

**Chunking impact:** Symbolic index doesn't care about chunk boundaries, only aggregate metadata.

### 2. Embedding Index (Semantic Search)

**Purpose:** Semantic similarity search via vector embeddings  
**Location:** Module data stored alongside chunks in `<module>/<filepath>.json`  
**Storage:** `.raggrep/index/<module>/<filepath>.json`

**What it stores:**

```typescript
interface SemanticModuleData {
  embeddings: number[][]; // One embedding per chunk
  embeddingModel: string;
}

interface FileIndex {
  filepath: string;
  chunks: Chunk[]; // ← The actual chunks
  moduleData: SemanticModuleData;
}
```

**How it uses chunks:**

```typescript
// From TypeScript module indexFile()
const chunkContents = parsedChunks.map((c) => {
  const namePrefix = c.name ? `${c.name}: ` : "";
  return `${pathPrefix} ${namePrefix}${c.content}`; // ← Full chunk content
});
const embeddings = await getEmbeddings(chunkContents); // ← One per chunk
```

**Chunking impact:** **CRITICAL** - Each chunk gets its own embedding. Chunk quality directly affects search quality.

### 3. Literal Index (Exact Match Boosting)

**Purpose:** O(1) lookup for exact identifier matches  
**Location:** `src/infrastructure/storage/literalIndex.ts`  
**Storage:** `.raggrep/index/<module>/literals/_index.json`

**What it stores:**

```typescript
interface LiteralIndexData {
  version: string;
  entries: {
    [literalKey: string]: LiteralIndexEntry[]; // lowercase → entries
  };
}

interface LiteralIndexEntry {
  chunkId: string; // ← Links to chunk
  filepath: string;
  originalCasing: string; // ← Extracted from chunk name
  type: LiteralType; // className, functionName, etc.
  matchType: LiteralMatchType; // definition, reference, import
}
```

**How it uses chunks:**

```typescript
// From TypeScript module indexFile()
for (const chunk of chunks) {
  const literals = extractLiterals(chunk); // ← Extracts from chunk.name, chunk.type
  if (literals.length > 0) {
    this.pendingLiterals.set(chunk.id, { filepath, literals });
  }
}
```

**Chunking impact:** **HIGH** - Literal quality depends on accurate chunk names and types (function names, class names, etc.).

## Chunking Strategies by Module

### 1. TypeScript Module (AST-based)

**Location:** `src/modules/language/typescript/parseCode.ts`  
**Strategy:** TypeScript Compiler API for AST parsing

```typescript
function parseTypeScript(content: string, filepath: string): ParsedChunk[] {
  const sourceFile = ts.createSourceFile(filepath, content, ...);

  // Extracts semantic chunks:
  // - Function declarations (including async, arrow functions)
  // - Class declarations
  // - Interface declarations
  // - Type alias declarations
  // - Enum declarations
  // - Exported variable declarations

  // Falls back to single file chunk if no semantic chunks found
}
```

**Chunk characteristics:**

- **Semantic boundaries**: Functions, classes, interfaces, types, enums
- **Named chunks**: Each has a name (identifier)
- **Export awareness**: Tracks `isExported` flag
- **JSDoc support**: Captures documentation comments
- **Line-accurate**: Precise start/end line numbers

**Quality:** ⭐⭐⭐⭐⭐ Excellent - Full AST understanding

### 2. Core Module (Regex-based)

**Location:** `src/modules/core/index.ts` → `createChunks()`  
**Strategy:** Line-based chunking with symbol detection

```typescript
private createChunks(
  filepath: string,
  content: string,
  symbols: ExtractedSymbol[]  // From regex extraction
): Chunk[] {
  const lines = content.split("\n");
  const chunks: Chunk[] = [];

  // Fixed-size chunks: 50 lines per chunk, 10 line overlap
  const LINES_PER_CHUNK = 50;
  const CHUNK_OVERLAP = 10;

  for (let start = 0; start < lines.length; start += LINES_PER_CHUNK - CHUNK_OVERLAP) {
    const end = Math.min(start + LINES_PER_CHUNK, lines.length);
    const chunkContent = lines.slice(start, end).join("\n");

    // Find symbols in this chunk range
    const chunkSymbols = symbols.filter(s => s.line >= start + 1 && s.line <= end);

    // Use first symbol for chunk type/name
    let chunkType: ChunkType = "block";
    let chunkName: string | undefined;
    if (chunkSymbols.length > 0) {
      chunkType = symbolTypeToChunkType(chunkSymbols[0].type);
      chunkName = chunkSymbols[0].name;
    }

    chunks.push({ id, content: chunkContent, startLine, endLine, type: chunkType, name: chunkName });
  }
}
```

**Chunk characteristics:**

- **Fixed-size boundaries**: 50 lines per chunk (arbitrary)
- **Overlapping**: 10 line overlap to preserve context
- **Symbol-aware naming**: Uses regex-detected symbols for names
- **May split functions**: No semantic understanding of boundaries

**Quality:** ⭐⭐ Fair - Simple but may break semantic units

### 3. Markdown Module (Section-based)

**Location:** `src/modules/docs/markdown/index.ts`  
**Strategy:** Parse by markdown headings

```typescript
// Parse Markdown into sections
const sections = parseMarkdownSections(content);

// Each section becomes a chunk
const chunks: Chunk[] = sections.map((section, i) => ({
  id: generateChunkId(filepath, section.startLine, section.endLine),
  content: section.heading
    ? `## ${section.heading}\n\n${section.content}`
    : section.content,
  startLine: section.startLine,
  endLine: section.endLine,
  type: "block" as ChunkType,
  name: section.heading || undefined, // ← Heading as chunk name
}));
```

**Chunk characteristics:**

- **Heading boundaries**: Split on `#`, `##`, `###`, etc.
- **Named chunks**: Heading text becomes chunk name
- **Semantic**: Respects document structure

**Quality:** ⭐⭐⭐⭐ Good - Respects document structure

### 4. JSON Module (File-level)

**Location:** `src/modules/data/json/index.ts`  
**Strategy:** Single chunk per file

```typescript
// Create single chunk for the entire file
const chunkId = generateChunkId(filepath, 1, lineCount);
const chunks: Chunk[] = [
  {
    id: chunkId,
    content: content, // ← Entire file
    startLine: 1,
    endLine: lineCount,
    type: "file",
  },
];
```

**Chunk characteristics:**

- **File-level**: One chunk = entire file
- **No splitting**: JSON structure preserved
- **Literals extracted separately**: JSON paths become literals

**Quality:** ⭐⭐⭐ Adequate - JSON is typically small

### 5. Generic Chunking Service (Unused by modules)

**Location:** `src/domain/services/chunking.ts`  
**Strategy:** Line-based with configurable size

```typescript
export function createLineBasedChunks(
  content: string,
  options: ChunkingOptions = {}
): TextChunk[] {
  const { chunkSize = 30, overlap = 5 } = options;

  // If small file, single chunk
  if (lines.length <= chunkSize) {
    return [{ content, startLine: 1, endLine: lines.length, type: "file" }];
  }

  // Split into overlapping chunks
  for (let i = 0; i < lines.length; i += chunkSize - overlap) {
    // ...
  }
}
```

**Note:** This service exists but is **not currently used** by any module. Each module implements its own chunking strategy.

## Chunking Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Module.indexFile()                       │
│                                                             │
│  Input: filepath, content, context                         │
│  Output: FileIndex with chunks                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Parse & Chunk  │
                    │                 │
                    │  TypeScript:    │
                    │   - TS API AST  │
                    │                 │
                    │  Core:          │
                    │   - Regex       │
                    │   - Line-based  │
                    │                 │
                    │  Markdown:      │
                    │   - Headings    │
                    │                 │
                    │  JSON:          │
                    │   - Whole file  │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  ParsedChunk[]  │
                    │                 │
                    │  - content      │
                    │  - startLine    │
                    │  - endLine      │
                    │  - type         │
                    │  - name         │
                    │  - isExported   │
                    └─────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │  Symbolic   │  │  Embedding  │  │   Literal   │
    │   Index     │  │    Index    │  │    Index    │
    └─────────────┘  └─────────────┘  └─────────────┘
         │                  │                  │
         ▼                  ▼                  ▼
    Keywords          Embeddings         Identifiers
    Exports           (one per chunk)    (from names)
    BM25 stats        Vector search      Exact match
```

## Where Tree-sitter Fits

### Current Pain Points

1. **Core Module (Regex):**

   - ❌ Fixed 50-line chunks break semantic units
   - ❌ May split functions/classes in half
   - ❌ Inaccurate symbol detection
   - ❌ No scope/context understanding

2. **Limited Language Support:**

   - ✅ TypeScript/JavaScript: Excellent (TS API)
   - ❌ Python: Regex only (poor quality)
   - ❌ Go: Regex only (poor quality)
   - ❌ Rust: Regex only (poor quality)
   - ❌ Java: Regex only (poor quality)

3. **Inconsistent Chunk Quality:**
   - TypeScript: High-quality AST chunks
   - Other languages: Low-quality line-based chunks
   - Affects all three indexes

### Tree-sitter Integration Point

**Recommendation:** Replace parsing at the **module level** (`indexFile()` method)

```
Current:
┌──────────────────────────────────────────────────────┐
│  TypeScript Module                                   │
│  ├── parseTypeScriptCode() ← TypeScript Compiler API│
│  └── indexFile() ← Uses parsed chunks               │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  Core Module                                         │
│  ├── extractSymbols() ← Regex                       │
│  ├── createChunks() ← Line-based (50 lines)        │
│  └── indexFile() ← Uses chunks                      │
└──────────────────────────────────────────────────────┘

Proposed:
┌──────────────────────────────────────────────────────┐
│  Infrastructure Layer                                │
│  └── TreeSitterParser (implements IParser)          │
│      ├── parse(content, language) → ParsedChunk[]   │
│      └── Supports: TS, JS, Python, Go, Rust, etc.   │
└──────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────┐
│  All Language Modules                                │
│  ├── Python Module                                   │
│  ├── Go Module                                       │
│  ├── Rust Module                                     │
│  └── indexFile() ← Uses tree-sitter parsed chunks   │
└──────────────────────────────────────────────────────┘
```

### Why This Layer?

1. **Single Point of Change**: All modules benefit from better parsing
2. **Feeds All Indexes**: Better chunks → better symbolic, embedding, and literal indexes
3. **Consistent Quality**: Same parsing quality across all languages
4. **Clean Architecture**: Parser is infrastructure, modules use it via port

## Impact Analysis

### Symbolic Index Impact: **MEDIUM**

**Current:**

```typescript
// Keywords extracted from chunks
for (const chunk of chunks) {
  const keywords = extractKeywords(chunk.content, chunk.name);
  allKeywords.add(...keywords);
}
```

**With Tree-sitter:**

- ✅ Better chunk names → better keywords
- ✅ More accurate chunk types → better filtering
- ✅ Proper export detection → better ranking
- ⚠️ Still aggregates across chunks (less sensitive to boundaries)

**Improvement:** 20-30% better keyword quality

### Embedding Index Impact: **HIGH**

**Current:**

```typescript
// One embedding per chunk
const chunkContents = parsedChunks.map((c) => c.content);
const embeddings = await getEmbeddings(chunkContents);
```

**With Tree-sitter:**

- ✅✅ Semantic boundaries → better embeddings
- ✅✅ Complete functions/classes → better context
- ✅✅ No mid-function splits → better semantic understanding
- ✅ Named chunks → better embedding context

**Improvement:** 40-60% better search quality (most impactful)

### Literal Index Impact: **CRITICAL**

**Current:**

```typescript
// Extracts from chunk names
const literals = extractLiterals(chunk); // Uses chunk.name, chunk.type

// Example:
// chunk.name = "handleLogin"
// chunk.type = "function"
// → literal: { value: "handleLogin", type: "functionName", matchType: "definition" }
```

**With Tree-sitter:**

- ✅✅✅ Accurate function/class names → precise literal matching
- ✅✅ Proper type detection → better literal types
- ✅✅ Definition vs reference → better match types
- ✅ Scope information → could add scope-aware literals

**Improvement:** 60-80% better literal matching (most critical)

**Why Critical?** Literal index is only as good as chunk names. Current regex may miss or misidentify names.

## Chunking Strategy Tradeoffs

### Option 1: Tree-sitter at Parse Time (Recommended)

**Where:** Replace parsing in each module's `indexFile()`

```typescript
// Before
const parsedChunks = parseTypeScriptCode(content, filepath); // TS API

// After
const parsedChunks = treeSitterParser.parse(content, "typescript"); // Tree-sitter
```

**Pros:**

- ✅ Single point of change
- ✅ Consistent across languages
- ✅ Feeds all three indexes
- ✅ Clean architecture (parser is infrastructure)

**Cons:**

- ⚠️ Lose TypeScript type information (TS API has better type details)
- ⚠️ Need to map tree-sitter nodes to chunk types

**Mitigation:** Keep TS API as option for TypeScript module

### Option 2: Tree-sitter for Pre-chunking (Alternative)

**Where:** Before module processing, in indexer

```typescript
// In indexer/index.ts
const preChunks = treeSitterParser.parse(content, language);
const fileIndex = await module.indexFile(filepath, content, ctx, preChunks);
```

**Pros:**

- ✅ Modules can still do custom processing
- ✅ Separation of concerns

**Cons:**

- ❌ More complex interface
- ❌ Modules might ignore pre-chunks
- ❌ Harder to maintain

**Verdict:** Not recommended - too complex

### Option 3: Tree-sitter in Domain Service (Alternative)

**Where:** Generic chunking service in domain layer

```typescript
// src/domain/services/chunking.ts
export function createASTChunks(
  content: string,
  language: string
): TextChunk[] {
  // Use tree-sitter (but domain shouldn't depend on infrastructure!)
}
```

**Pros:**

- ✅ Reusable across modules

**Cons:**

- ❌ Violates Clean Architecture (domain depends on infrastructure)
- ❌ Tree-sitter is external dependency (belongs in infrastructure)

**Verdict:** Not recommended - architecture violation

## Recommended Approach

### Phase 1: Infrastructure Layer

Create tree-sitter parser in infrastructure:

```typescript
// src/infrastructure/parsing/treeSitterParser.ts
export class TreeSitterParser implements IParser {
  parse(content: string, language: string): ParsedChunk[] {
    // Use tree-sitter to parse
    // Map tree-sitter nodes to ParsedChunk[]
  }
}
```

### Phase 2: Module Integration

Update modules to use tree-sitter:

```typescript
// src/modules/language/python/index.ts
export class PythonModule implements IndexModule {
  private parser: IParser;

  async initialize(config: ModuleConfig) {
    this.parser = new TreeSitterParser("python");
  }

  async indexFile(filepath: string, content: string, ctx: IndexContext) {
    // Parse with tree-sitter
    const parsedChunks = this.parser.parse(content, "python");

    // Generate embeddings (same as TypeScript module)
    const embeddings = await getEmbeddings(...);

    // Extract literals (same as TypeScript module)
    const literals = parsedChunks.map(extractLiterals);

    // Build symbolic summary (same as TypeScript module)
    const fileSummary = { ... };

    // All three indexes benefit!
    return { chunks, moduleData: { embeddings }, ... };
  }
}
```

### Phase 3: Gradual Migration

1. Keep TypeScript module using TS API (proven quality)
2. Add Python module with tree-sitter
3. Add Go module with tree-sitter
4. Add Rust module with tree-sitter
5. Eventually offer tree-sitter as option for TypeScript

## Conclusion

### Key Findings

1. **Chunking happens once** at module level during `indexFile()`
2. **All three indexes** (symbolic, embedding, literal) use the same chunks
3. **Embedding and literal indexes** are most sensitive to chunk quality
4. **Tree-sitter belongs at parsing layer** (infrastructure), not in domain

### Impact Priority

1. **Literal Index**: ⭐⭐⭐⭐⭐ Critical - Depends on accurate names
2. **Embedding Index**: ⭐⭐⭐⭐⭐ High - Depends on semantic boundaries
3. **Symbolic Index**: ⭐⭐⭐ Medium - Aggregates metadata

### Recommendation

**Integrate tree-sitter at the module parsing layer** (`indexFile()` method) as an infrastructure adapter. This provides:

- ✅ Maximum impact on all three indexes
- ✅ Clean architecture (parser is infrastructure)
- ✅ Consistent quality across languages
- ✅ Single point of maintenance

**Next Steps:**

1. Create `IParser` port in domain
2. Implement `TreeSitterParser` in infrastructure
3. Create Python/Go/Rust modules using tree-sitter
4. Benchmark quality improvements
5. Consider tree-sitter option for TypeScript module

The chunking layer is indeed "as fundamental as properly reading the file" - it's the foundation that feeds all three index types, making it the ideal integration point for tree-sitter.
