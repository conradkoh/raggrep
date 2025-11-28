# AGENTS.md - Guidelines for AI Coding Assistants

This document provides guidelines for AI coding assistants working on this codebase.
The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD",
"SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be
interpreted as described in [RFC 2119](https://www.ietf.org/rfc/rfc2119.txt).

## Architecture Overview

This project follows **Clean Architecture** principles. Code is organized into layers
with strict dependency rules.

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
│  │   Pure data types        │     │  │   Config loading/saving  │
│  │                          │     │  │                          │
│  ├── ports/                 │◄────│  ├── embeddings/            │
│  │   Interfaces             │     │  │   Transformers.js        │
│  │                          │     │  │                          │
│  ├── services/              │     │  ├── filesystem/            │
│  │   Pure algorithms        │     │  │   Node.js fs             │
│  │                          │     │  │                          │
│  └── usecases/              │     │  └── storage/               │
│      Business logic         │     │      Index file I/O         │
└─────────────────────────────┘     └─────────────────────────────┘
```

## Layer Rules

### Domain Layer (`src/domain/`)

The domain layer MUST contain only pure business logic with NO external dependencies.

#### `src/domain/entities/`

- MUST contain only data types (interfaces, types, classes)
- MUST NOT import from `infrastructure/`, `app/`, or external packages
- MUST NOT perform I/O operations
- MAY import from other domain entities

**Examples of what belongs here:**
- `Chunk`, `FileIndex`, `SearchResult` - Core data structures
- `Config`, `ModuleConfig` - Configuration types
- `FileSummary`, `FileIntrospection` - Index metadata types

#### `src/domain/ports/`

- MUST define interfaces for external dependencies
- MUST NOT contain implementations
- SHOULD be named as capabilities (e.g., `IFileSystem`, `IEmbeddingProvider`)

#### `src/domain/services/`

- MUST contain pure algorithms with no I/O
- MUST NOT import from `infrastructure/`
- MAY import from `domain/entities/` and `domain/ports/`
- SHOULD be stateless functions or classes

**Examples of what belongs here:**
- `BM25Index` - BM25 search algorithm
- `extractKeywords()` - Keyword extraction logic
- `cosineSimilarity()` - Vector similarity calculation

#### `src/domain/usecases/`

- MUST contain business logic use cases
- MAY depend on domain entities, ports, and services
- SHOULD accept dependencies through parameters (dependency injection)
- MUST NOT perform I/O directly (use injected dependencies)

**Examples of what belongs here:**
- `indexDirectory()` - Orchestrates indexing a directory
- `searchIndex()` - Orchestrates searching the index
- `cleanupIndex()` - Removes stale entries

### Infrastructure Layer (`src/infrastructure/`)

The infrastructure layer implements domain ports using external technologies.

#### General Rules

- MUST implement interfaces defined in `domain/ports/`
- MAY import external packages (fs, path, @xenova/transformers, etc.)
- MAY import from `domain/entities/` for type definitions
- MUST NOT contain business logic

#### `src/infrastructure/config/`

- MUST contain configuration loading and saving
- Currently: `configLoader.ts` with path utilities and config I/O

#### `src/infrastructure/embeddings/`

- MUST contain embedding provider implementations
- Currently: `TransformersEmbeddingProvider` using Transformers.js
- Provides global API functions: `getEmbedding()`, `getEmbeddings()`, `configureEmbeddings()`

#### `src/infrastructure/filesystem/`

- MUST contain file system operations
- Currently: `NodeFileSystem` using Node.js fs

#### `src/infrastructure/storage/`

- MUST contain index persistence logic
- Includes: Reading/writing JSON index files, manifest management
- Currently: `FileIndexStorage`, `SymbolicIndex`

### Application Layer (`src/app/`)

The application layer orchestrates domain use cases and infrastructure.

#### `src/app/indexer/`

- Orchestrates the indexing process
- Coordinates modules, handles file discovery
- Currently: `index.ts`, `watcher.ts`

#### `src/app/search/`

- Orchestrates the search process
- Aggregates results from multiple modules
- Currently: `index.ts`

#### `src/app/cli/`

- Presentation layer (CLI interface)
- MUST handle user input/output
- MUST NOT contain business logic
- SHOULD delegate to app orchestration code

## Special Directories

### `src/modules/`

Index modules are **cross-cutting concerns** that implement the `IndexModule` interface.

- Modules MAY combine domain logic and infrastructure concerns
- Modules MUST implement the standard module interface
- New modules SHOULD follow the existing pattern in `language/typescript/`

### `src/introspection/`

⚠️ **NEEDS REFACTORING** - This directory mixes domain and infrastructure.

Planned migration:
- `types.ts` → `domain/entities/introspection.ts`
- `fileIntrospector.ts` (pure logic) → `domain/services/`
- `projectDetector.ts` (file I/O) → `infrastructure/`
- `IntrospectionIndex` (file I/O) → `infrastructure/storage/`

## Dependency Rules

### MUST Follow

1. Domain MUST NOT import from Infrastructure
2. Domain MUST NOT import from App (except usecases may import types)
3. Infrastructure MAY import from Domain (entities and ports only)
4. App MAY import from Domain and Infrastructure
5. CLI MAY import from App

### Import Patterns

```typescript
// ✅ CORRECT: Infrastructure implements domain port
// src/infrastructure/embeddings/transformersEmbedding.ts
import type { IEmbeddingProvider } from '../../domain/ports';

// ✅ CORRECT: App uses domain and infrastructure
// src/app/indexer/index.ts
import type { Config } from '../../domain/entities';
import { loadConfig } from '../../infrastructure/config';

// ✅ CORRECT: Use case accepts injected dependencies
// src/domain/usecases/indexDirectory.ts
import type { FileSystem } from '../ports';

// ❌ WRONG: Domain importing from infrastructure
// src/domain/services/search.ts
import { readFile } from 'fs/promises'; // NO!

// ❌ WRONG: Domain importing from app
// src/domain/entities/config.ts
import { indexDirectory } from '../../app/indexer'; // NO!
```

## File Naming Conventions

- Entity files: `camelCase.ts` (e.g., `searchResult.ts`)
- Service files: `camelCase.ts` (e.g., `bm25.ts`)
- Port interfaces: `camelCase.ts` with `I` prefix (e.g., `IFileSystem` in `filesystem.ts`)
- Infrastructure adapters: `PascalCase.ts` (e.g., `NodeFileSystem.ts`)
- Test files: `*.test.ts` next to the file being tested

## Adding New Functionality

### Decision Tree

When adding new code, ask:

1. **Is it a data structure or type?**
   → `domain/entities/`

2. **Is it a pure algorithm with no I/O?**
   → `domain/services/`

3. **Is it an interface for external capabilities?**
   → `domain/ports/`

4. **Is it business logic that orchestrates other services?**
   → `domain/usecases/`

5. **Does it do file/network I/O?**
   → `infrastructure/<category>/`

6. **Does it coordinate multiple modules or services?**
   → `app/<category>/`

7. **Does it handle user input/output?**
   → `app/cli/`

### Example: Adding a New Feature

If adding "code complexity analysis":

```
src/
├── domain/
│   ├── entities/
│   │   └── complexity.ts      # ComplexityScore type
│   ├── ports/
│   │   └── complexity.ts      # IComplexityAnalyzer interface
│   ├── services/
│   │   └── complexity.ts      # calculateComplexity() pure function
│   └── usecases/
│       └── analyzeComplexity.ts  # Orchestrates analysis
│
├── infrastructure/
│   └── complexity/
│       └── tsComplexity.ts    # TypeScript AST-based implementation
│
└── app/
    └── complexity/
        └── index.ts           # Coordinates analysis workflow
```

## Testing

- Tests SHOULD be co-located with source files (`*.test.ts`)
- Domain services MUST have unit tests (they're pure functions)
- Infrastructure adapters SHOULD have integration tests
- Use `bun test` to run all tests

## Documentation

- Each directory SHOULD have an `index.ts` that re-exports public API
- Each module SHOULD have TSDoc comments on public functions
- Architecture decisions SHOULD be documented in `docs/`
