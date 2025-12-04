# Literal Boosting

## Overview

Literal Boosting is a technique for improving search precision by preserving and prioritizing exact-match terms during code search. Unlike semantic expansion (which broadens search), literal boosting ensures that specific identifiers receive appropriate weight when matched exactly.

**Status: Implemented** in v0.7.0

## Problem Statement

Semantic search treats all terms as concepts to be matched approximately. However, in code search, many terms are **identifiers** with precise meaning:

- A query for `AuthService` means _that specific class_, not "authentication-related services"
- A query for `handleLogin` means _that specific function_, not "functions that handle logins"
- A query for `lodash` means _that specific package_, not "utility libraries"

Without literal boosting, these precise queries get diluted by semantic similarity, returning conceptually-related but incorrect results.

## Solution

The literal boosting system introduces a **literal index** that:

1. Extracts and preserves exact identifiers during indexing (from TypeScript AST)
2. Detects literal terms in queries (explicit and implicit)
3. Applies multiplicative score boosts when exact matches are found
4. Produces its own candidate list that merges with semantic/BM25 results

## Query Literal Detection

Literals in queries are detected through two methods:

### Explicit Detection (High Confidence)

Users can explicitly mark literals using backticks or quotes:

```
find the `AuthService` class
where is "handleLogin" used
```

### Implicit Detection (Pattern-Based)

Literals are inferred from naming patterns:

| Pattern             | Regex                       | Confidence | Example        | Inferred Type |
| ------------------- | --------------------------- | ---------- | -------------- | ------------- |
| **PascalCase**      | `[A-Z][a-z]+([A-Z][a-z]+)+` | Medium     | `AuthService`  | className     |
| **camelCase**       | `[a-z]+[A-Z][a-zA-Z]*`      | Medium     | `getUserById`  | functionName  |
| **SCREAMING_SNAKE** | `[A-Z]+(_[A-Z]+)+`          | Medium     | `MAX_RETRIES`  | variableName  |
| **snake_case**      | `[a-z]+(_[a-z]+)+`          | Low        | `user_auth`    | identifier    |
| **kebab-case**      | `[a-z]+(-[a-z]+)+`          | Low        | `auth-service` | packageName   |

### Detection Interface

```typescript
interface DetectedLiteral {
  /** The literal value (without backticks) */
  value: string;

  /** Original as it appeared in query */
  rawValue: string;

  /** Detection confidence */
  confidence: "high" | "medium" | "low";

  /** How the literal was detected */
  detectionMethod: "explicit-backtick" | "explicit-quote" | "implicit-casing";

  /** Inferred type based on pattern */
  inferredType?: LiteralType;
}

interface QueryLiteralParseResult {
  /** Detected literals */
  literals: DetectedLiteral[];

  /** Query with explicit literals removed (for semantic search) */
  remainingQuery: string;
}
```

## Architecture

### Two-Path Search Pipeline

The literal boosting system implements true two-path retrieval:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Search Pipeline                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Query: "find the `AuthService` class"                                  │
│                    │                                                     │
│        ┌───────────┴───────────┐                                        │
│        ▼                       ▼                                        │
│  ┌──────────────┐       ┌──────────────┐                                │
│  │ Semantic +   │       │ Literal      │                                │
│  │ BM25 Search  │       │ Index Lookup │                                │
│  │              │       │              │                                │
│  │ All indexed  │       │ Exact match  │                                │
│  │ chunks       │       │ by name      │                                │
│  └──────┬───────┘       └──────┬───────┘                                │
│         │                      │                                        │
│         │ Results A            │ Results B                              │
│         │ (with literal boost) │ (literal-only)                         │
│         │                      │                                        │
│         └──────────┬───────────┘                                        │
│                    ▼                                                    │
│  ┌──────────────────────────────────────────────────────────┐          │
│  │                    Merge & Score                          │          │
│  │                                                           │          │
│  │  For each unique chunk:                                   │          │
│  │    if in semantic+BM25:                                  │          │
│  │      base = semantic * 0.7 + bm25 * 0.3                  │          │
│  │      if literal_match: score = base * MULTIPLIER         │          │
│  │    if literal_only:                                      │          │
│  │      score = BASE_SCORE * MULTIPLIER                     │          │
│  └──────────────────────────────────────────────────────────┘          │
│                              │                                          │
│                              ▼                                          │
│                    Sorted Results                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Literal Extraction (Index Time)

For the TypeScript module, literals are extracted from **AST-parsed code structures**:

```typescript
// From parseCode.ts - TypeScript AST parsing
// Extracts: class names, function names, interface names, type names, enum names

// literalExtractor.ts uses chunk.name from AST
export function extractLiterals(chunk: Chunk): ExtractedLiteral[] {
  if (chunk.name) {
    return [
      {
        value: chunk.name, // From TypeScript AST (accurate)
        type: chunkTypeToLiteralType[chunk.type],
        matchType: "definition",
      },
    ];
  }
  return [];
}
```

**What gets indexed as literals:**

| Chunk Type  | Example                      | Literal Type    |
| ----------- | ---------------------------- | --------------- |
| `class`     | `class AuthService {}`       | `className`     |
| `function`  | `function validateSession()` | `functionName`  |
| `interface` | `interface UserProfile {}`   | `interfaceName` |
| `type`      | `type AuthToken = ...`       | `typeName`      |
| `enum`      | `enum UserRole {}`           | `enumName`      |
| `variable`  | `const MAX_RETRIES = 3`      | `variableName`  |

### Literal Index Storage

```
.raggrep/index/language/typescript/literals/
└── _index.json    # literal → chunk mappings
```

**Index format:**

```typescript
interface LiteralIndexEntry {
  chunkId: string;
  filepath: string; // Enables literal-only retrieval
  originalCasing: string;
  type: LiteralType;
  matchType: LiteralMatchType;
}

interface LiteralIndexData {
  version: "1.0.0";
  entries: Record<string, LiteralIndexEntry[]>; // lowercase → entries
}
```

### Match Types

Not all literal matches are equal. We distinguish by how the chunk relates to the literal:

```typescript
type LiteralMatchType =
  | "definition" // Chunk IS the literal (e.g., class AuthService {})
  | "reference" // Chunk USES the literal (e.g., new AuthService())
  | "import"; // Chunk imports the literal
```

Currently, the TypeScript module only extracts **definitions** (the chunk's own name from AST).

### Scoring Model (Multiplicative)

**Score Calculation:**

```typescript
// For chunks found via semantic/BM25
baseScore = semanticScore * 0.7 + bm25Score * 0.3;

// Apply literal multiplier if chunk contains query literals
if (hasLiteralMatch) {
  score = baseScore * getLiteralMultiplier(matchType, confidence);
} else {
  score = baseScore;
}

// For chunks found ONLY via literal index (not in semantic/BM25)
if (literalOnlyMatch) {
  score = LITERAL_BASE_SCORE * getLiteralMultiplier(matchType, confidence);
}
```

**Multiplier Values:**

| Match Type     | High Confidence | Medium Confidence | Low Confidence |
| -------------- | --------------- | ----------------- | -------------- |
| **definition** | 2.5             | 2.0               | 1.5            |
| **reference**  | 2.0             | 1.5               | 1.3            |
| **import**     | 1.5             | 1.3               | 1.1            |

**Constants:**

```typescript
const LITERAL_SCORING_CONSTANTS = {
  BASE_SCORE: 0.5, // Base score for literal-only matches
  MULTIPLIERS: {
    definition: { high: 2.5, medium: 2.0, low: 1.5 },
    reference: { high: 2.0, medium: 1.5, low: 1.3 },
    import: { high: 1.5, medium: 1.3, low: 1.1 },
  },
};
```

### Example Scoring

Query: `` find the `AuthService` class ``

| Chunk                   | Semantic | BM25 | Match Type | Multiplier | Final Score          |
| ----------------------- | -------- | ---- | ---------- | ---------- | -------------------- |
| AuthService.ts (class)  | 0.3      | 0.4  | definition | 2.5        | (0.21+0.12)×2.5=0.83 |
| authUtils.ts (uses)     | 0.5      | 0.6  | reference  | 2.0        | (0.35+0.18)×2.0=1.06 |
| loginService.ts         | 0.7      | 0.2  | none       | 1.0        | 0.49+0.06=0.55       |
| auth/index.ts (imports) | 0.2      | 0.3  | import     | 1.5        | (0.14+0.09)×1.5=0.35 |

## Implementation

### Files

**Domain Layer:**

- `src/domain/entities/literal.ts` - Type definitions
- `src/domain/services/queryLiteralParser.ts` - Query parsing
- `src/domain/services/literalExtractor.ts` - Chunk literal extraction
- `src/domain/services/literalScorer.ts` - Scoring logic

**Infrastructure Layer:**

- `src/infrastructure/storage/literalIndex.ts` - Literal index I/O

**Module Integration:**

- `src/modules/language/typescript/index.ts` - TypeScript module integration

### Search Context

Results include literal boosting context:

```typescript
interface SearchResult {
  // ... existing fields
  context: {
    semanticScore: number;
    bm25Score: number;
    // Literal boosting context
    literalMultiplier: number;
    literalMatchType?: LiteralMatchType;
    literalConfidence?: LiteralConfidence;
    literalMatchCount: number;
    literalOnly?: boolean; // True if found only via literal index
  };
}
```

## Benefits

1. **Precision**: Exact queries get exact results
2. **Two-path retrieval**: Literal-only matches always surface
3. **Speed**: O(1) literal lookup vs O(n) semantic comparison
4. **Predictable**: Users can force exact matching with backticks
5. **Multiplicative**: Doesn't override semantic relevance, enhances it
6. **Type-aware**: Definitions rank higher than references
7. **AST-based**: Uses TypeScript compiler for accurate extraction

## Relationship to Semantic Expansion

Literal Boosting and [Structured Semantic Expansion](./structured-semantic-expansion.md) are complementary but separate concerns:

| Aspect          | Literal Boosting        | Semantic Expansion   |
| --------------- | ----------------------- | -------------------- |
| **Goal**        | Preserve exactness      | Broaden search       |
| **Direction**   | Term → itself           | Term → related terms |
| **Data source** | AST-extracted from code | Curated lexicon      |
| **Lifecycle**   | Automatic               | Manual curation      |
| **Status**      | ✅ Implemented          | 📋 Planned           |

## Future Considerations

- **Reference extraction**: Extract type references, imports from chunk content
- **Scope-aware literals**: Distinguish between local variables and exported symbols
- **Usage frequency weighting**: Boost more heavily for rare identifiers
- **Cross-file relationship tracking**: Link definitions to usages
- **Fuzzy matching**: Typo-tolerant literal matching (e.g., `AuthServce` → `AuthService`)
