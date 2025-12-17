# Tree-sitter Integration Research

**Date:** December 17, 2025  
**Goal:** Integrate tree-sitter to improve the quality of indexing for supported code files

## Executive Summary

RAGgrep is a local semantic search tool for codebases that follows Clean Architecture principles. It currently uses the TypeScript Compiler API for parsing TypeScript/JavaScript files and regex-based extraction for other languages. Integrating tree-sitter would provide:

1. **Unified parsing** across multiple languages (Python, Go, Rust, Java, etc.)
2. **Better code structure understanding** with consistent AST-based chunking
3. **Improved search quality** through more accurate symbol extraction and context
4. **Extensibility** for adding new language support without custom parsers

## Current Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Presentation                           │
│                      (src/app/cli/)                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Application                            │
│                   (src/app/)                                │
│                   Orchestration (indexer, search)           │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────────┐     ┌─────────────────────────────┐
│      Domain Layer           │     │    Infrastructure Layer     │
│    (src/domain/)            │     │    (src/infrastructure/)    │
│                             │     │                             │
│  ├── entities/              │     │  ├── config/                │
│  ├── ports/                 │◄────│  ├── embeddings/            │
│  ├── services/              │     │  ├── filesystem/            │
│  └── usecases/              │     │  └── storage/               │
└─────────────────────────────┘     └─────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │   Index Modules     │
                    │   (src/modules/)    │
                    │                     │
                    │  ├── core/          │
                    │  └── language/      │
                    │      └── typescript/│
                    └─────────────────────┘
```

### Key System Components

#### 1. **Domain Layer** (`src/domain/`)

Pure business logic with NO external dependencies.

**Entities** (`src/domain/entities/`):

- `Chunk` - Core data structure for code segments
- `FileIndex` - Index data for a single file
- `SearchResult` - Search result with scoring
- `Config` - Configuration types
- `Literal` - Literal identifier types for exact matching

**Ports** (`src/domain/ports/`):

- `IFileSystem` - File system operations interface
- `IEmbeddingProvider` - Embedding generation interface
- `IStorage` - Index storage interface

**Services** (`src/domain/services/`):

- `bm25.ts` - BM25 keyword search algorithm
- `chunking.ts` - Generic text chunking
- `keywords.ts` - Keyword extraction
- `literalExtractor.ts` - Extract literals from AST chunks
- `similarity.ts` - Cosine similarity calculation
- `introspection.ts` - File metadata extraction

#### 2. **Infrastructure Layer** (`src/infrastructure/`)

Implements domain ports using external technologies.

- `embeddings/` - Transformers.js for local embeddings
- `filesystem/` - Node.js fs wrapper
- `storage/` - JSON file-based index storage
- `config/` - Configuration loading/saving

#### 3. **Application Layer** (`src/app/`)

Orchestrates domain and infrastructure.

- `indexer/index.ts` - Main indexing orchestration
- `search/index.ts` - Search orchestration
- `cli/main.ts` - CLI interface

#### 4. **Index Modules** (`src/modules/`)

Pluggable modules implementing the `IndexModule` interface.

**Current Modules:**

1. **Core Module** (`src/modules/core/`):

   - Language-agnostic text search
   - Regex-based symbol extraction
   - BM25 keyword matching
   - Line-based chunking (50 lines per chunk with 10 line overlap)

2. **TypeScript Module** (`src/modules/language/typescript/`):
   - AST parsing via TypeScript Compiler API
   - Semantic embeddings for chunks
   - Literal index for exact identifier matching
   - Supports: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.mts`, `.cts`

### Current Parsing Implementation

#### TypeScript Module (`src/modules/language/typescript/parseCode.ts`)

Uses the **TypeScript Compiler API** for accurate AST-based parsing:

```typescript
function parseTypeScript(content: string, filepath: string): ParsedChunk[] {
  const sourceFile = ts.createSourceFile(
    filepath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  // Extracts:
  // - Function declarations (including async)
  // - Arrow functions and function expressions
  // - Class declarations
  // - Interface declarations
  // - Type alias declarations
  // - Enum declarations
  // - Exported variable declarations

  // Returns ParsedChunk[]
}
```

**Extracted Information:**

- Content (full source text)
- Start/end line numbers
- Chunk type (function, class, interface, type, enum, variable)
- Name (identifier)
- Export status
- JSDoc comments

#### Core Module (`src/modules/core/symbols.ts`)

Uses **regex patterns** for symbol extraction:

```typescript
// Patterns for:
// - Function declarations: /function\s+(\w+)/
// - Class declarations: /class\s+(\w+)/
// - Method declarations: /(\w+)\s*\([^)]*\)\s*{/
// - Variable declarations: /(?:const|let|var)\s+(\w+)/
```

**Limitations:**

- No language-specific understanding
- May miss complex syntax
- No scope/context information
- Simple line-based chunking

### Indexing Flow

```
1. CLI parses arguments
2. Load config from index directory
3. Find all matching files (respecting ignore patterns)
4. For each file (in parallel):
   a. Parse into chunks via AST (TypeScript) or regex (Core)
   b. Generate embeddings for each chunk
   c. Extract keywords for symbolic index
   d. Extract literals from chunk names
   e. Write per-file index to disk
5. Build and persist BM25 index
6. Build and persist literal index
7. Update manifests
```

### Search Flow

```
1. Parse query for literals (backticks, quotes, casing patterns)
2. Load symbolic index (for path context and metadata)
3. Load literal index (for exact-match lookup)
4. Get list of all indexed files
5. Apply file pattern filters if specified
6. Generate query embedding
7. Build literal match map from query literals
8. For each indexed file:
   a. Load file index (chunks + embeddings)
   b. Build BM25 index from chunk contents
9. Compute BM25 scores for query
10. For each chunk:
    - Compute cosine similarity (semantic score)
    - Look up BM25 score (keyword score)
    - Look up literal matches for chunk
    - Calculate: base = 0.7 × semantic + 0.3 × BM25
    - Apply literal multiplier if matched
    - Add boosts (path, file type, chunk type, export)
11. Add literal-only results
12. Filter by minimum score threshold
13. Sort by final score
14. Return top K results
```

## Tree-sitter Benefits

### 1. **Multi-Language Support**

Tree-sitter provides battle-tested parsers for many languages:

| Language   | Current Support  | Tree-sitter Parser | Benefits          |
| ---------- | ---------------- | ------------------ | ----------------- |
| TypeScript | ✅ Full (TS API) | ✅ Available       | Unified approach  |
| JavaScript | ✅ Full (TS API) | ✅ Available       | Unified approach  |
| Python     | ❌ Regex only    | ✅ Available       | AST-based parsing |
| Go         | ❌ Regex only    | ✅ Available       | AST-based parsing |
| Rust       | ❌ Regex only    | ✅ Available       | AST-based parsing |
| Java       | ❌ Regex only    | ✅ Available       | AST-based parsing |
| C/C++      | ❌ Regex only    | ✅ Available       | AST-based parsing |
| Ruby       | ❌ Not indexed   | ✅ Available       | New support       |
| PHP        | ❌ Not indexed   | ✅ Available       | New support       |

### 2. **Consistent Chunk Quality**

Tree-sitter provides consistent AST nodes across languages:

- **Functions/Methods**: Full signature + body
- **Classes/Structs**: Complete definition with members
- **Interfaces/Traits**: Full interface definition
- **Type Definitions**: Complete type declarations
- **Comments**: Associated documentation
- **Scope Information**: Nested structure preserved

### 3. **Better Context Understanding**

Tree-sitter enables:

- **Scope-aware chunking**: Understand nested functions, classes
- **Import/export tracking**: Better reference resolution
- **Comment association**: Link documentation to code
- **Syntax-aware splitting**: Never break in the middle of a statement

### 4. **Performance**

- **Incremental parsing**: Only re-parse changed sections
- **Fast**: Written in C, optimized for speed
- **Memory efficient**: Streaming parser
- **Error resilient**: Continues parsing even with syntax errors

## Integration Strategy

### Phase 1: Research & Prototype (Current)

**Goals:**

- ✅ Understand current architecture
- ✅ Identify key components
- ⬜ Research tree-sitter Node.js bindings
- ⬜ Create proof-of-concept parser
- ⬜ Compare output quality with current implementation

**Deliverables:**

- This research document
- Prototype tree-sitter parser module
- Performance benchmarks
- Quality comparison

### Phase 2: Core Integration

**Goals:**

- Create tree-sitter infrastructure adapter
- Implement language-agnostic parser interface
- Add tree-sitter as a parsing option

**Architecture:**

```
src/
├── domain/
│   ├── entities/
│   │   └── ast.ts              # AST node types (language-agnostic)
│   └── ports/
│       └── parser.ts           # IParser interface
│
├── infrastructure/
│   └── parsing/
│       ├── treeSitterParser.ts # Tree-sitter implementation
│       └── typescriptParser.ts # Existing TS API wrapper
│
└── modules/
    └── language/
        ├── typescript/         # Existing (use tree-sitter or TS API)
        ├── python/             # New (tree-sitter)
        ├── go/                 # New (tree-sitter)
        └── rust/               # New (tree-sitter)
```

**Key Decisions:**

1. **Parser Port** (`src/domain/ports/parser.ts`):

   ```typescript
   interface IParser {
     parse(content: string, filepath: string): ParsedChunk[];
     supportsLanguage(language: string): boolean;
   }
   ```

2. **Tree-sitter Adapter** (`src/infrastructure/parsing/treeSitterParser.ts`):

   - Implements `IParser`
   - Wraps tree-sitter Node.js bindings
   - Handles language detection
   - Maps tree-sitter nodes to `ParsedChunk[]`

3. **Keep TypeScript API Option**:
   - TypeScript API provides better type information
   - Can use both: tree-sitter for structure, TS API for types
   - Configuration option to choose parser

### Phase 3: Language Module Expansion

**Goals:**

- Add Python module
- Add Go module
- Add Rust module
- Standardize module interface

**Implementation Pattern:**

Each language module follows the same structure:

```typescript
// src/modules/language/python/index.ts
export class PythonModule implements IndexModule {
  readonly id = "language/python";
  readonly name = "Python Search";

  private parser: IParser;

  async initialize(config: ModuleConfig): Promise<void> {
    this.parser = new TreeSitterParser("python");
  }

  async indexFile(filepath: string, content: string, ctx: IndexContext) {
    const chunks = this.parser.parse(content, filepath);
    // Generate embeddings, extract literals, etc.
    // (Same flow as TypeScript module)
  }

  async search(query: string, ctx: SearchContext, options: SearchOptions) {
    // Same hybrid search as TypeScript module
  }
}
```

### Phase 4: Advanced Features

**Goals:**

- Incremental parsing for watch mode
- Cross-reference tracking (imports/exports)
- Scope-aware search boosting
- Language-specific optimizations

## Technical Considerations

### 1. **Tree-sitter Node.js Bindings**

**Options:**

| Package            | Pros                       | Cons                          |
| ------------------ | -------------------------- | ----------------------------- |
| `tree-sitter`      | Official, well-maintained  | Requires native compilation   |
| `web-tree-sitter`  | WASM-based, no compilation | Larger bundle, slower startup |
| `node-tree-sitter` | Community fork             | Less maintained               |

**Recommendation:** Start with official `tree-sitter` package.

### 2. **Language Grammar Installation**

Tree-sitter requires language-specific grammars:

```bash
npm install tree-sitter-typescript
npm install tree-sitter-python
npm install tree-sitter-go
npm install tree-sitter-rust
```

**Strategy:**

- Bundle common languages (TS, JS, Python, Go, Rust)
- Optional peer dependencies for others
- Lazy loading for unused languages

### 3. **Chunk Mapping**

Need to map tree-sitter node types to RAGgrep chunk types:

```typescript
// Tree-sitter node type → ChunkType mapping
const NODE_TYPE_MAP: Record<string, ChunkType> = {
  // Python
  function_definition: "function",
  class_definition: "class",

  // Go
  function_declaration: "function",
  type_declaration: "type",
  interface_type: "interface",

  // Rust
  function_item: "function",
  struct_item: "class",
  trait_item: "interface",
  enum_item: "enum",
};
```

### 4. **Performance Impact**

**Considerations:**

- Tree-sitter parsing is fast (~1ms per file)
- Native compilation adds setup complexity
- WASM version is slower but easier to deploy

**Mitigation:**

- Parallel parsing (already implemented)
- Caching parsed results (already implemented)
- Benchmark before/after

### 5. **Backward Compatibility**

**Strategy:**

- Keep existing TypeScript API parser as default for TS/JS
- Add tree-sitter as opt-in via config
- Gradual migration path

```json
// config.json
{
  "modules": {
    "language/typescript": {
      "enabled": true,
      "options": {
        "parser": "typescript-api" // or "tree-sitter"
      }
    }
  }
}
```

## Quality Improvements Expected

### 1. **Better Chunking**

**Current (Regex):**

```python
# May split in the middle of a function
def complex_function(
    arg1,
    arg2
):  # ← Chunk boundary might be here
    body
```

**With Tree-sitter:**

```python
# Always gets complete function
def complex_function(
    arg1,
    arg2
):
    body  # ← Complete chunk
```

### 2. **Accurate Symbol Extraction**

**Current (Regex):**

- Misses nested functions
- Confused by comments
- No scope information

**With Tree-sitter:**

- Understands nesting
- Ignores comments
- Provides scope context

### 3. **Language-Specific Features**

**Python:**

- Decorators
- Properties
- Class methods vs instance methods
- Async/await

**Go:**

- Interfaces
- Struct methods
- Goroutines
- Channels

**Rust:**

- Traits
- Implementations
- Macros
- Lifetimes

## Next Steps

### Immediate Actions

1. **Install tree-sitter dependencies**:

   ```bash
   npm install tree-sitter tree-sitter-typescript tree-sitter-python
   ```

2. **Create prototype parser** (`src/infrastructure/parsing/treeSitterParser.ts`):

   - Basic tree-sitter wrapper
   - Parse TypeScript file
   - Compare output with current parser

3. **Benchmark performance**:

   - Parse 100 TypeScript files
   - Compare speed: tree-sitter vs TS API
   - Measure memory usage

4. **Quality comparison**:
   - Parse sample files with both parsers
   - Compare chunk boundaries
   - Evaluate search result quality

### Short-term (1-2 weeks)

1. Implement `IParser` port
2. Create tree-sitter adapter
3. Add configuration option
4. Update TypeScript module to use either parser
5. Write tests

### Medium-term (1 month)

1. Add Python module with tree-sitter
2. Add Go module with tree-sitter
3. Add Rust module with tree-sitter
4. Update documentation
5. Performance optimization

### Long-term (2-3 months)

1. Incremental parsing for watch mode
2. Cross-reference tracking
3. Scope-aware search
4. Additional language support

## Open Questions

1. **Should we keep TypeScript API parser?**

   - Pro: Better type information, proven quality
   - Con: Dual maintenance, complexity
   - **Recommendation:** Keep both, make tree-sitter opt-in initially

2. **How to handle language detection?**

   - File extension mapping
   - Content-based detection
   - Configuration override
   - **Recommendation:** Extension-based with config override

3. **What about languages without tree-sitter grammars?**

   - Fall back to regex-based core module
   - Community grammar support
   - **Recommendation:** Graceful fallback to core module

4. **How to handle parsing errors?**

   - Tree-sitter is error-resilient
   - Partial AST still useful
   - **Recommendation:** Use partial results, log errors

5. **Should we parse incrementally in watch mode?**
   - Tree-sitter supports incremental parsing
   - Requires keeping parse trees in memory
   - **Recommendation:** Phase 4 feature, not MVP

## Success Metrics

### Quantitative

- **Parsing speed**: < 5ms per file (currently ~2ms with TS API)
- **Memory usage**: < 100MB for 1000 files
- **Search quality**: > 90% relevant results in top 5
- **Language coverage**: 5+ languages with AST parsing

### Qualitative

- **Developer experience**: Easy to add new languages
- **Search accuracy**: Better results for complex queries
- **Maintainability**: Cleaner, more consistent code
- **Extensibility**: Simple to add language-specific features

## Conclusion

Integrating tree-sitter into RAGgrep is a natural evolution that aligns with the Clean Architecture principles already in place. The modular design makes it straightforward to add tree-sitter as a parsing infrastructure adapter without disrupting existing functionality.

**Key Benefits:**

1. Unified parsing across languages
2. Better code understanding
3. Improved search quality
4. Easy extensibility

**Recommended Approach:**

1. Start with prototype and benchmarks
2. Add tree-sitter as opt-in for TypeScript
3. Expand to Python, Go, Rust
4. Gradually make it the default

**Risk Mitigation:**

1. Keep existing parsers as fallback
2. Extensive testing before switching defaults
3. Performance monitoring
4. Gradual rollout with feature flags

The architecture is well-suited for this integration, and the benefits justify the implementation effort.
