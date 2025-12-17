# Tree-sitter Integration Milestones

**Date:** December 17, 2025  
**Status:** ✅ Complete  
**Reference:** See `tree-sitter-architecture.md` for high-level design

## Overview

This document breaks down the tree-sitter integration into concrete milestones with specific tasks, verifications, and commits. Each milestone is designed to be independently testable and committable.

---

## Milestone 1: Parser Infrastructure

**Goal:** Set up tree-sitter infrastructure without changing existing functionality

**Duration:** 3-4 days

### Tasks

#### 1.1 Create Domain Ports

**Files to create:**
- `src/domain/ports/parser.ts`
- `src/domain/entities/ast.ts`

**Changes:**
- Define `IParser` interface
- Define `ParsedChunk` interface (may already exist, extend if needed)
- Define `ParserConfig` interface
- Define language-agnostic AST types

**Rationale:** Clean Architecture - domain defines contracts, infrastructure implements

#### 1.2 Install Core Dependencies

**Command:**
```bash
bun add tree-sitter
```

**Files to update:**
- `package.json` (automatic)

**Rationale:** Only install core tree-sitter, grammars installed dynamically

#### 1.3 Create Grammar Manager

**File to create:**
- `src/infrastructure/parsing/grammarManager.ts`

**Changes:**
- Implement `GrammarManager` singleton class
- Methods: `getGrammar()`, `isInstalled()`, `preInstallCommon()`
- Use `Bun.spawn()` for dynamic installation
- Thread-safe concurrent installation handling
- In-memory grammar caching

**Rationale:** Centralized grammar management with dynamic installation

#### 1.4 Create Tree-sitter Parser

**File to create:**
- `src/infrastructure/parsing/treeSitterParser.ts`

**Changes:**
- Implement `TreeSitterParser` class (implements `IParser`)
- Use `GrammarManager` for grammar loading
- Implement basic `extractChunks()` for Python (start simple)
- Stub `associateComments()` (implement in Milestone 2)

**Rationale:** Infrastructure adapter for tree-sitter

#### 1.5 Create TypeScript Parser Wrapper

**File to create:**
- `src/infrastructure/parsing/typescriptParser.ts`

**Changes:**
- Implement `TypeScriptParser` class (implements `IParser`)
- Delegate to existing `parseTypeScriptCode()` function
- Thin wrapper, no logic changes

**Rationale:** Wrap existing parser to implement new interface

#### 1.6 Create Parser Factory

**File to create:**
- `src/infrastructure/parsing/parserFactory.ts`

**Changes:**
- Implement `createParser()` function
- Implement `detectLanguage()` function
- Language-to-parser mapping logic

**Rationale:** Factory pattern for parser selection

#### 1.7 Create Infrastructure Index

**File to create:**
- `src/infrastructure/parsing/index.ts`

**Changes:**
- Export all parsing infrastructure
- Clean public API

### Verification

**Unit Tests:**

**File:** `src/infrastructure/parsing/grammarManager.test.ts`
- Test grammar caching
- Test concurrent installation (mock `Bun.spawn`)
- Test installation failure handling

**File:** `src/infrastructure/parsing/treeSitterParser.test.ts`
- Test Python file parsing (with mocked grammar)
- Test chunk extraction
- Test language detection

**File:** `src/infrastructure/parsing/typescriptParser.test.ts`
- Test delegation to existing parser
- Verify no behavior changes

**File:** `src/infrastructure/parsing/parserFactory.test.ts`
- Test parser selection logic
- Test language detection

**Integration Test:**

**File:** `src/infrastructure/parsing/integration.test.ts`
- Test end-to-end: file → parser → chunks
- Test grammar installation (real, not mocked)
- Test fallback on installation failure

**Manual Verification:**
```bash
# Install and test
bun test src/infrastructure/parsing/

# Try parsing a Python file
bun run src/infrastructure/parsing/treeSitterParser.ts test.py
```

### Commit

```
feat(parsing): add tree-sitter infrastructure with dynamic grammar installation

- Add IParser interface and domain types
- Implement GrammarManager with Bun-based dynamic installation
- Implement TreeSitterParser with Python support
- Wrap existing TypeScript parser in new interface
- Add parser factory for language-based selection

Tests: Unit and integration tests for all components
```

---

## Milestone 2: README Context & Enhanced Introspection

**Goal:** Add README hierarchy traversal and context linking

**Duration:** 2-3 days

### Tasks

#### 2.1 Extend FileIntrospection Entity

**File to update:**
- `src/domain/entities/introspection.ts`

**Changes:**
- Add `nearestReadme?: string` field to `FileIntrospection`

**Rationale:** Domain entity extension for new metadata

#### 2.2 Implement README Traversal

**File to update:**
- `src/domain/services/introspection.ts`

**Changes:**
- Add `findNearestReadme(filepath: string, rootDir: string): string | undefined`
- Traverse up directory tree
- Check for README.md, readme.md, index.md
- Return relative path from rootDir
- Integrate into `introspectFile()` function

**Rationale:** Pure function in domain services (no I/O)

#### 2.3 Update IntrospectionIndex

**File to update:**
- `src/infrastructure/introspection/IntrospectionIndex.ts`

**Changes:**
- Pass filesystem access to `introspectFile()` for README checks
- Store README path in introspection data

**Rationale:** Infrastructure provides I/O for domain service

#### 2.4 Use README Context in Embeddings

**Files to update:**
- `src/modules/language/typescript/index.ts`
- (Will update other modules in Milestone 4)

**Changes:**
- Get introspection data in `indexFile()`
- Prepend README reference to chunk content for embedding:
  ```typescript
  const readmeContext = introspection?.nearestReadme 
    ? `[See: ${introspection.nearestReadme}] ` 
    : "";
  const chunkContent = `${readmeContext}${pathPrefix} ${chunk.content}`;
  ```

**Rationale:** README context improves semantic understanding

### Verification

**Unit Tests:**

**File:** `src/domain/services/introspection.test.ts`
- Test `findNearestReadme()` with various directory structures
- Test when no README exists
- Test multiple README files at different levels

**Integration Test:**

**File:** `src/infrastructure/introspection/introspection.integration.test.ts`
- Test with real file system
- Verify README paths are correct
- Test with nested directories

**Manual Verification:**
```bash
# Test introspection
bun test src/domain/services/introspection.test.ts

# Index a project with READMEs
bun run raggrep index

# Check introspection data
cat .raggrep/introspection/files/src/auth/session.json
# Should contain: "nearestReadme": "src/auth/README.md"
```

### Commit

```
feat(introspection): add README hierarchy traversal and context linking

- Add nearestReadme field to FileIntrospection
- Implement findNearestReadme() with directory traversal
- Integrate README context into embedding generation
- Update TypeScript module to use README context

Tests: Unit tests for README traversal, integration tests with real filesystem
```

---

## Milestone 3: Vocabulary Extraction & Literal Index Enhancement

**Goal:** Extract vocabulary from symbols and enhance literal index

**Duration:** 3-4 days

### Tasks

#### 3.1 Extend Literal Entities

**File to update:**
- `src/domain/entities/literal.ts`

**Changes:**
- Add `vocabulary?: string[]` field to `ExtractedLiteral`
- Add `synonyms?: string[]` field to `ExtractedLiteral` (for Milestone 3.4)

**Rationale:** Domain entity extension for vocabulary data

#### 3.2 Implement Vocabulary Extraction

**File to update:**
- `src/domain/services/literalExtractor.ts`

**Changes:**
- Add `extractVocabulary(literal: string): string[]` function
- Implement camelCase splitting
- Implement snake_case splitting
- Implement kebab-case splitting
- Implement SCREAMING_SNAKE_CASE handling
- Update `extractLiterals()` to populate vocabulary field

**Rationale:** Pure function for vocabulary extraction

#### 3.3 Update Literal Index Storage

**File to update:**
- `src/infrastructure/storage/literalIndex.ts`

**Changes:**
- Update `LiteralIndexEntry` interface to include `vocabulary: string[]`
- Update `addLiterals()` to store vocabulary
- Add `findByVocabulary(word: string): LiteralMatch[]` method
- Update serialization/deserialization

**Rationale:** Infrastructure storage for vocabulary data

#### 3.4 Implement Synonym Expansion (Index Time)

**File to create:**
- `src/domain/services/synonymExpansion.ts`

**Changes:**
- Define synonym dictionary (hardcoded for MVP)
- Implement `getSynonyms(word: string, level: 'conservative' | 'moderate' | 'aggressive'): string[]`
- Implement `expandVocabularyWithSynonyms(vocabulary: string[], config): string[]`

**Rationale:** Domain service for synonym logic

#### 3.5 Integrate Vocabulary in Modules

**File to update:**
- `src/modules/language/typescript/index.ts`

**Changes:**
- In `indexFile()`, after extracting literals, expand with synonyms
- Store expanded vocabulary in literal index
- Use conservative expansion level by default

**Rationale:** Apply vocabulary extraction during indexing

### Verification

**Unit Tests:**

**File:** `src/domain/services/literalExtractor.test.ts`
- Test `extractVocabulary()` with various naming conventions
- Test camelCase: `getUserById` → `["get", "user", "by", "id"]`
- Test snake_case: `get_user_by_id` → `["get", "user", "by", "id"]`
- Test kebab-case: `get-user-by-id` → `["get", "user", "by", "id"]`
- Test SCREAMING_SNAKE_CASE: `MAX_RETRY_COUNT` → `["max", "retry", "count"]`
- Test mixed cases

**File:** `src/domain/services/synonymExpansion.test.ts`
- Test synonym expansion at different levels
- Test `get` → conservative → `["fetch", "retrieve"]`
- Test `get` → moderate → `["fetch", "retrieve", "obtain", "acquire"]`

**File:** `src/infrastructure/storage/literalIndex.test.ts`
- Test vocabulary storage and retrieval
- Test `findByVocabulary()` method

**Integration Test:**

**File:** `src/modules/language/typescript/vocabulary.integration.test.ts`
- Index a TypeScript file with various naming conventions
- Verify vocabulary is extracted and stored
- Query by vocabulary words and verify matches

**Manual Verification:**
```bash
# Test vocabulary extraction
bun test src/domain/services/literalExtractor.test.ts

# Index a project
bun run raggrep index

# Check literal index
cat .raggrep/index/language/typescript/literals/_index.json
# Should contain vocabulary arrays for each literal

# Search by vocabulary word
bun run raggrep query "user"
# Should match getUserById, fetchUserData, etc.
```

### Commit

```
feat(literals): add vocabulary extraction and synonym expansion

- Add vocabulary field to ExtractedLiteral entity
- Implement extractVocabulary() for all naming conventions
- Enhance literal index to store and search vocabulary
- Implement synonym expansion with configurable levels
- Integrate vocabulary extraction in TypeScript module

Tests: Unit tests for vocabulary extraction and synonym expansion
```

---

## Milestone 4: Full File Chunks & Multi-Granularity Markdown

**Goal:** Add full file chunks for code and hierarchical markdown chunking

**Duration:** 4-5 days

### Tasks

#### 4.1 Add Full File Chunks to Code Modules

**Files to update:**
- `src/modules/language/typescript/index.ts`
- (Will add Python module in Milestone 5)

**Changes:**
- After parsing semantic chunks, create full file chunk:
  ```typescript
  const fullFileChunk: ParsedChunk = {
    content: content,
    startLine: 1,
    endLine: lines.length,
    type: 'file',
    name: path.basename(filepath),
  };
  const allChunks = [fullFileChunk, ...semanticChunks];
  ```
- Generate embeddings for all chunks (including full file)
- Add configuration option: `includeFullFileChunk: boolean`

**Rationale:** Enable broad context queries

#### 4.2 Implement Hierarchical Markdown Parsing

**File to update:**
- `src/modules/docs/markdown/index.ts`

**Changes:**
- Replace `parseMarkdownSections()` with `parseMarkdownHierarchical()`
- New function creates chunks at all heading levels
- Each chunk includes its nested content
- Algorithm:
  1. Parse heading structure
  2. For each heading level (h1-h5):
     - Create chunk with heading text as name
     - Include all content up to next same-level heading
     - Include nested headings in content
- Add configuration: `granularityLevels: string[]` (default: `["h1", "h2", "h3", "h4"]`)

**Rationale:** Enable hierarchical search at different zoom levels

#### 4.3 Add Chunk Type Weighting

**File to update:**
- `src/domain/services/similarity.ts` or create new file

**Changes:**
- Add `calculateChunkTypeBoost(chunkType: ChunkType): number`
- Weights:
  - `file`: 0.8 (lower than semantic)
  - `function`, `class`: 1.0 (baseline)
  - `h1`: 0.7 (lower, too broad)
  - `h2`, `h3`: 1.0 (baseline)
  - `h4`, `h5`: 1.1 (higher, more specific)

**Rationale:** Prefer specific chunks over broad ones

#### 4.4 Update Search Scoring

**Files to update:**
- `src/modules/language/typescript/index.ts` (search method)
- `src/modules/docs/markdown/index.ts` (search method)

**Changes:**
- Apply chunk type boost in scoring:
  ```typescript
  const chunkTypeBoost = calculateChunkTypeBoost(chunk.type);
  const finalScore = baseScore * chunkTypeBoost + otherBoosts;
  ```

**Rationale:** Rank results by specificity

### Verification

**Unit Tests:**

**File:** `src/modules/docs/markdown/hierarchical.test.ts`
- Test hierarchical parsing with nested headings
- Test chunk boundaries
- Test content inclusion
- Test with various markdown structures

**File:** `src/domain/services/similarity.test.ts`
- Test chunk type boost calculation
- Verify weights are applied correctly

**Integration Test:**

**File:** `src/modules/language/typescript/fullfile.integration.test.ts`
- Index a TypeScript file
- Verify full file chunk is created
- Verify semantic chunks still work
- Search for broad query, verify full file chunk ranks appropriately

**File:** `src/modules/docs/markdown/hierarchical.integration.test.ts`
- Index a markdown file with nested headings
- Search for broad query (should match h1)
- Search for specific query (should match h3/h4)
- Verify ranking by specificity

**Manual Verification:**
```bash
# Test markdown parsing
bun test src/modules/docs/markdown/

# Index a project with markdown
bun run raggrep index

# Search for broad query
bun run raggrep query "project overview"
# Should return h1 chunks

# Search for specific query
bun run raggrep query "authentication flow details"
# Should return h3/h4 chunks with higher rank
```

### Commit

```
feat(chunking): add full file chunks and hierarchical markdown

- Add full file chunk creation for code files
- Implement hierarchical markdown parsing (h1-h5)
- Add chunk type weighting for scoring
- Add configuration options for chunk types
- Update search scoring to use chunk type boosts

Tests: Unit tests for hierarchical parsing and chunk weighting
```

---

## Milestone 5: Python Module with Tree-sitter

**Goal:** Create first language module using tree-sitter

**Duration:** 4-5 days

### Tasks

#### 5.1 Implement Python Chunk Extraction

**File to update:**
- `src/infrastructure/parsing/treeSitterParser.ts`

**Changes:**
- Implement `extractChunks()` for Python
- Map tree-sitter node types to chunk types:
  - `function_definition` → `function`
  - `class_definition` → `class`
  - `decorated_definition` → detect underlying type
- Extract function/class names
- Detect exports (top-level definitions)
- Handle docstrings (first string in function/class body)

**Rationale:** Language-specific chunk extraction

#### 5.2 Implement Comment Association for Python

**File to update:**
- `src/infrastructure/parsing/treeSitterParser.ts`

**Changes:**
- Implement `associateComments()` for Python
- Extract docstrings from AST
- Find `#` comments preceding functions/classes
- Attach as `jsDoc` (docstrings) or `comments` (regular comments)

**Rationale:** Associate documentation with code

#### 5.3 Create Python Module

**File to create:**
- `src/modules/language/python/index.ts`

**Changes:**
- Implement `PythonModule` class (implements `IndexModule`)
- Use `TreeSitterParser` for parsing
- Follow same pattern as TypeScript module:
  - `indexFile()`: parse, generate embeddings, extract literals
  - `finalize()`: build symbolic and literal indexes
  - `search()`: hybrid search with literal boosting
- Add full file chunk
- Enable comment association

**Rationale:** First tree-sitter-based language module

#### 5.4 Register Python Module

**File to update:**
- `src/modules/registry.ts`

**Changes:**
- Import `PythonModule`
- Register in `registerBuiltInModules()`

**Rationale:** Make module available

#### 5.5 Update Default Config

**File to update:**
- `src/domain/entities/config.ts` (default config)

**Changes:**
- Add Python to default extensions: `.py`
- Add Python module to default enabled modules

**Rationale:** Enable Python support by default

### Verification

**Unit Tests:**

**File:** `src/infrastructure/parsing/treeSitterParser.python.test.ts`
- Test Python chunk extraction
- Test function detection
- Test class detection
- Test docstring extraction
- Test comment association

**File:** `src/modules/language/python/index.test.ts`
- Test module initialization
- Test file indexing
- Test literal extraction from Python code

**Integration Test:**

**File:** `src/modules/language/python/integration.test.ts`
- Index real Python files
- Verify chunks are created correctly
- Verify docstrings are associated
- Search Python code and verify results

**Manual Verification:**
```bash
# Test Python parsing
bun test src/infrastructure/parsing/treeSitterParser.python.test.ts

# Index a Python project
cd /path/to/python/project
bun run raggrep index

# Search Python code
bun run raggrep query "user authentication"
# Should return Python functions/classes

# Check index structure
cat .raggrep/index/language/python/src/auth.json
# Verify chunks, docstrings, literals
```

### Commit

```
feat(python): add Python module with tree-sitter parsing

- Implement Python chunk extraction in TreeSitterParser
- Add docstring and comment association for Python
- Create PythonModule following TypeScript module pattern
- Register Python module in registry
- Add Python to default configuration

Tests: Unit and integration tests for Python parsing and indexing
```

---

## Milestone 6: Vocabulary Search & Scoring

**Goal:** Implement vocabulary-based search and scoring

**Duration:** 3-4 days

### Tasks

#### 6.1 Implement Vocabulary Matching

**File to update:**
- `src/domain/services/literalScorer.ts`

**Changes:**
- Add `calculateVocabularyOverlap(queryVocab: string[], indexedVocab: string[]): number`
- Calculate overlap percentage
- Return score 0.0 to 1.0

**Rationale:** Core vocabulary matching logic

#### 6.2 Update Literal Scoring

**File to update:**
- `src/domain/services/literalScorer.ts`

**Changes:**
- Update `calculateLiteralContribution()` to use vocabulary matching
- Scoring tiers:
  - Exact match: 1.0 → multiplier 2.5×
  - High vocab overlap (>75%): 0.8 → multiplier 2.0×
  - Medium vocab overlap (>50%): 0.5 → multiplier 1.5×
  - Low vocab overlap (<50%): 0.3 → multiplier 1.2×

**Rationale:** Graduated scoring based on vocabulary overlap

#### 6.3 Implement Search-Time Synonym Expansion

**File to update:**
- `src/domain/services/queryLiteralParser.ts`

**Changes:**
- Update `parseQueryLiterals()` to expand with synonyms
- Use moderate/aggressive expansion level (configurable)
- Expand query vocabulary before matching

**Rationale:** Improve search recall

#### 6.4 Update Module Search Methods

**Files to update:**
- `src/modules/language/typescript/index.ts`
- `src/modules/language/python/index.ts`

**Changes:**
- In `search()` method, use updated literal scoring
- Pass vocabulary-expanded query to literal matcher

**Rationale:** Apply vocabulary matching in search

### Verification

**Unit Tests:**

**File:** `src/domain/services/literalScorer.vocabulary.test.ts`
- Test `calculateVocabularyOverlap()` with various inputs
- Test scoring tiers
- Test with synonyms

**File:** `src/domain/services/queryLiteralParser.test.ts`
- Test search-time synonym expansion
- Test vocabulary extraction from queries

**Integration Test:**

**File:** `src/tests/vocabulary-search.integration.test.ts`
- Index files with various naming conventions
- Search with partial vocabulary matches
- Verify scoring and ranking
- Test queries:
  - `"get user"` → should match `getUserById`, `fetchUserData`
  - `"user"` → should match all functions with "user" in name
  - `"fetch"` → should match `getUserById` (via synonym)

**Manual Verification:**
```bash
# Index a project
bun run raggrep index

# Test vocabulary search
bun run raggrep query "get user"
# Should match: getUserById, fetchUserData, retrieveUserInfo

bun run raggrep query "user"
# Should match: all functions with "user" in name

# Check scoring
bun run raggrep query "get user by" --verbose
# Should show vocabulary overlap scores
```

### Commit

```
feat(search): implement vocabulary-based search and scoring

- Add vocabulary overlap calculation
- Update literal scoring with vocabulary matching tiers
- Implement search-time synonym expansion
- Update module search methods to use vocabulary scoring

Tests: Unit tests for vocabulary matching, integration tests for search
```

---

## Milestone 7: Additional Language Modules

**Goal:** Add Go and Rust modules

**Duration:** 3-4 days

### Tasks

#### 7.1 Implement Go Chunk Extraction

**File to update:**
- `src/infrastructure/parsing/treeSitterParser.ts`

**Changes:**
- Add Go node type mappings
- Extract functions, methods, structs, interfaces
- Handle Go doc comments (`//` before declarations)

**Rationale:** Go-specific parsing

#### 7.2 Create Go Module

**File to create:**
- `src/modules/language/go/index.ts`

**Changes:**
- Follow Python module pattern
- Use `TreeSitterParser` with Go language

**Rationale:** Add Go support

#### 7.3 Implement Rust Chunk Extraction

**File to update:**
- `src/infrastructure/parsing/treeSitterParser.ts`

**Changes:**
- Add Rust node type mappings
- Extract functions, structs, traits, impls
- Handle Rust doc comments (`///`, `//!`)

**Rationale:** Rust-specific parsing

#### 7.4 Create Rust Module

**File to create:**
- `src/modules/language/rust/index.ts`

**Changes:**
- Follow Python module pattern
- Use `TreeSitterParser` with Rust language

**Rationale:** Add Rust support

#### 7.5 Register New Modules

**File to update:**
- `src/modules/registry.ts`

**Changes:**
- Import and register Go and Rust modules

**Rationale:** Make modules available

### Verification

**Unit Tests:**
- `src/infrastructure/parsing/treeSitterParser.go.test.ts`
- `src/infrastructure/parsing/treeSitterParser.rust.test.ts`
- Test chunk extraction for each language

**Integration Tests:**
- Index real Go and Rust projects
- Verify chunks and search results

**Manual Verification:**
```bash
# Test Go
cd /path/to/go/project
bun run raggrep index
bun run raggrep query "http handler"

# Test Rust
cd /path/to/rust/project
bun run raggrep index
bun run raggrep query "async function"
```

### Commit

```
feat(languages): add Go and Rust modules with tree-sitter

- Implement Go chunk extraction and doc comment handling
- Implement Rust chunk extraction and doc comment handling
- Create GoModule and RustModule
- Register new modules in registry

Tests: Unit and integration tests for Go and Rust
```

---

## Milestone 8: Polish & Documentation

**Goal:** Production-ready release with complete documentation

**Duration:** 4-5 days

### Tasks

#### 8.1 Error Handling & Fallbacks

**Files to update:**
- `src/infrastructure/parsing/grammarManager.ts`
- `src/infrastructure/parsing/treeSitterParser.ts`
- `src/app/indexer/index.ts`

**Changes:**
- Graceful fallback to Core module on parse errors
- Clear error messages with troubleshooting steps
- Logging for debugging

**Rationale:** Robust error handling

#### 8.2 Performance Optimization

**Files to update:**
- `src/infrastructure/parsing/grammarManager.ts`
- `src/infrastructure/parsing/treeSitterParser.ts`

**Changes:**
- Grammar caching optimization
- Lazy loading optimization
- Parallel parsing (already implemented, verify)

**Rationale:** Ensure good performance

#### 8.3 Configuration Validation

**File to create:**
- `src/domain/services/configValidator.ts`

**Changes:**
- Validate configuration options
- Provide helpful error messages for invalid config

**Rationale:** Better developer experience

#### 8.4 Update Documentation

**Files to update:**
- `docs/architecture.md` - Add tree-sitter section
- `docs/cli-reference.md` - Add grammar management commands
- `docs/configuration.md` - Document new options
- `README.md` - Update language support matrix

**Files to create:**
- `docs/tree-sitter-guide.md` - Comprehensive guide

**Rationale:** Complete documentation

#### 8.5 End-to-End Testing

**File to create:**
- `src/tests/e2e/tree-sitter.test.ts`

**Changes:**
- Test full workflow: install → index → search
- Test multiple languages
- Test error scenarios
- Test configuration options

**Rationale:** Verify complete system

### Verification

**Performance Benchmarks:**
```bash
# Benchmark indexing
bun run benchmark:index

# Benchmark search
bun run benchmark:search

# Compare with baseline (before tree-sitter)
```

**Manual Testing:**
```bash
# Test fresh installation
rm -rf node_modules .raggrep
bun install
bun run raggrep index

# Test multi-language project
cd /path/to/polyglot/project
bun run raggrep index
bun run raggrep query "authentication"

# Test error scenarios
# - Network failure during grammar install
# - Invalid syntax in source files
# - Missing grammars
```

### Commit

```
feat(polish): production-ready release with documentation

- Add comprehensive error handling and fallbacks
- Optimize grammar caching and loading
- Add configuration validation
- Update all documentation
- Add end-to-end tests

Tests: E2E tests, performance benchmarks
```

---

## Summary

### Total Duration: 6-7 weeks

| Milestone | Duration | Key Deliverable |
|-----------|----------|-----------------|
| M1: Parser Infrastructure | 3-4 days | Tree-sitter setup, dynamic grammars |
| M2: README Context | 2-3 days | README hierarchy traversal |
| M3: Vocabulary & Literals | 3-4 days | Vocabulary extraction, synonyms |
| M4: Full File & Markdown | 4-5 days | Multi-granularity chunking |
| M5: Python Module | 4-5 days | First tree-sitter language |
| M6: Vocabulary Search | 3-4 days | Vocabulary-based scoring |
| M7: Go & Rust Modules | 3-4 days | Additional languages |
| M8: Polish & Docs | 4-5 days | Production-ready |

### Success Criteria

Each milestone must meet:
- ✅ All unit tests passing
- ✅ Integration tests passing
- ✅ Manual verification successful
- ✅ Code reviewed
- ✅ Committed with descriptive message

### Risk Mitigation

**If a milestone takes longer than expected:**
1. Break into smaller sub-milestones
2. Commit working parts incrementally
3. Document blockers and continue with next milestone
4. Return to blocked milestone later

**If tests fail:**
1. Fix before moving to next milestone
2. Do not commit failing code
3. Document test failures and root cause

**If performance is poor:**
1. Profile and identify bottlenecks
2. Optimize critical path
3. Consider feature flags for expensive operations
4. Document performance characteristics

