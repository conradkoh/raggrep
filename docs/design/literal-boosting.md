# Literal Boosting

## Overview

Literal Boosting is a technique for improving search precision by preserving and prioritizing exact-match terms during code search. Unlike semantic expansion (which broadens search), literal boosting ensures that specific identifiers receive appropriate weight when matched exactly.

## Problem Statement

Semantic search treats all terms as concepts to be matched approximately. However, in code search, many terms are **identifiers** with precise meaning:

- A query for `AuthService` means _that specific class_, not "authentication-related services"
- A query for `handleLogin` means _that specific function_, not "functions that handle logins"
- A query for `lodash` means _that specific package_, not "utility libraries"

Without literal boosting, these precise queries get diluted by semantic similarity, returning conceptually-related but incorrect results.

## Proposed Solution

Introduce a **literal index** that:

1. Extracts and preserves exact identifiers during indexing
2. Detects literal terms in queries
3. Applies score boosts when exact matches are found

### What Qualifies as a Literal?

| Type                      | Examples                                    | Detection Method                      |
| ------------------------- | ------------------------------------------- | ------------------------------------- |
| **Class names**           | `AuthService`, `UserRepository`             | PascalCase pattern                    |
| **Function names**        | `handleLogin`, `fetchUserData`              | camelCase pattern                     |
| **Package names**         | `express`, `lodash`, `@xenova/transformers` | Package reference patterns            |
| **Technical identifiers** | `JWT`, `OAuth2`, `UUID`                     | Known acronyms, alphanumeric patterns |
| **Quoted terms**          | `"exact phrase"`                            | Explicit user quotation               |

### Literal Properties

```typescript
interface Literal {
  // The exact term as it appears in code
  value: string;

  // Type classification for potential type-specific handling
  type: "className" | "functionName" | "package" | "identifier" | "quoted";

  // Whether matching should be case-sensitive
  caseSensitive: boolean;

  // Source location for navigation
  source?: {
    file: string;
    line: number;
  };
}
```

## Architecture

### At Index Time

1. **Extract literals from code**:

   - Parse AST to find class declarations, function declarations, imports
   - Preserve original casing
   - Record source locations

2. **Store in dedicated literal index**:

   ```typescript
   interface LiteralIndex {
     // Map from literal value → chunks containing it
     literals: Map<string, ChunkReference[]>;
   }
   ```

3. **Keep separate from semantic index**:
   - Literals are stored as-is, not embedded
   - Enables O(1) exact-match lookup

### At Query Time

1. **Detect literals in query**:

   - Quoted strings: `"AuthService"`
   - PascalCase: `AuthService`
   - camelCase: `handleLogin`
   - Known patterns: `JWT`, `OAuth2`

2. **Perform exact-match lookup**:

   - Check literal index for exact matches
   - Case-sensitive for code identifiers
   - Case-insensitive for quoted phrases (configurable)

3. **Apply boost to matching results**:
   ```typescript
   if (literalIndex.has(queryLiteral)) {
     matchingChunks.forEach((chunk) => {
       chunk.score += LITERAL_BOOST;
     });
   }
   ```

### Scoring Integration

Literal boosting integrates with other scoring signals:

```
final_score = semantic_score * semantic_weight
            + bm25_score * bm25_weight
            + literal_boost * has_exact_match
```

Suggested boost values:

| Match Type                     | Boost |
| ------------------------------ | ----- |
| Exact match (case-sensitive)   | +0.5  |
| Exact match (case-insensitive) | +0.3  |
| Partial match (substring)      | +0.1  |

## Example Flow

**Query**: `find uses of AuthService`

1. **Literal detection**:

   - `AuthService` detected as PascalCase → className literal

2. **Dual search**:

   - Semantic search: "find uses of authentication service" (conceptual)
   - Literal lookup: exact match on `AuthService`

3. **Result merging**:

   - Chunks containing exact `AuthService` → boosted
   - Chunks with semantic similarity only → normal score

4. **Final ranking**:
   - Files importing/using `AuthService` rank higher
   - Files about authentication in general rank lower

## Benefits

1. **Precision**: Exact queries get exact results
2. **Speed**: O(1) literal lookup vs O(n) semantic comparison
3. **Predictable**: Users can force exact matching with quotes
4. **Reusable**: Literal index supports other features:
   - Go to definition
   - Find all references
   - Rename refactoring

## Relationship to Semantic Expansion

Literal Boosting and [Structured Semantic Expansion](./structured-semantic-expansion.md) are complementary but separate concerns:

| Aspect          | Literal Boosting         | Semantic Expansion   |
| --------------- | ------------------------ | -------------------- |
| **Goal**        | Preserve exactness       | Broaden search       |
| **Direction**   | Term → itself            | Term → related terms |
| **Data source** | Auto-extracted from code | Curated lexicon      |
| **Lifecycle**   | Automatic                | Manual curation      |

They integrate at the scoring layer:

```
┌─────────────────────────────────────────────────────────────┐
│                      Search Scoring                         │
│                                                             │
│  final_score = semantic_score                               │
│              + literal_boost      ← from Literal Index      │
│              + expansion_boost    ← from SSE                │
└─────────────────────────────────────────────────────────────┘
```

## Open Questions

1. How do we handle literals that exist in multiple files (common names)?
2. Should we support fuzzy literal matching (typo tolerance)?
3. How do we distinguish between `authService` (variable) and `AuthService` (class)?
4. Should literal boost weight be configurable per-project?

## Future Considerations

- **Scope-aware literals**: Distinguish between local variables and exported symbols
- **Usage frequency weighting**: Boost more heavily for rare identifiers
- **Cross-file relationship tracking**: Link definitions to usages
- **IDE integration**: Share literal index with language server features
