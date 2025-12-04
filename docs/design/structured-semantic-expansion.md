# Structured Semantic Expansion

**Status: Implemented** in v0.8.0

## Overview

Structured Semantic Expansion (SSE) is a technique for improving search recall by augmenting queries with domain-specific synonym knowledge, without requiring model retraining.

## Problem Statement

On local machines, we are often constrained to use smaller embedding models. These models may lack the nuanced understanding of domain-specific relationships that larger models possess. For example:

- A small model may not recognize that "auth function" and "auth class" are conceptually related in a programming context
- Domain-specific synonyms and abbreviations may not be well-represented in the model's embedding space
- Related concepts (`function` ↔ `method`) may not cluster together in the embedding space

> **Note**: For exact-match boosting of identifiers like class names, see [Literal Boosting](./literal-boosting.md). SSE focuses on _expanding_ the search surface, while Literal Boosting focuses on _preserving_ exactness.

## Proposed Solution

Introduce a **lexicon** (or glossary) system that provides structured expansion of terms during query time. This acts as a form of "fine-tuning" without retraining, by augmenting the retrieval engine with domain-specific knowledge.

### Core Concepts

#### 1. Synonyms with Correlation Grades

Not all synonyms are equally correlated. We introduce a grading system:

| Grade        | Correlation              | Example                                       |
| ------------ | ------------------------ | --------------------------------------------- |
| **Strong**   | Near-equivalent concepts | `function` ↔ `method`, `class` ↔ `type`       |
| **Moderate** | Related but distinct     | `function` ↔ `class`, `import` ↔ `dependency` |
| **Weak**     | Loosely associated       | `auth` ↔ `security`, `config` ↔ `settings`    |

During search, synonyms contribute to scoring with weights proportional to their grade:

```
strong_weight   = 0.9
moderate_weight = 0.6
weak_weight     = 0.3
```

#### 2. Expansion Passes

Structured semantic expansion can be applied iteratively:

```
Pass 0: Original term        → "auth"
Pass 1: Direct synonyms      → "authentication", "authorization"
Pass 2: Synonym-of-synonyms  → "login", "permissions", "access control"
Pass 3+: Further expansion   → (diminishing quality)
```

**Important constraint**: Each pass yields more terms but with lower confidence. Expansion should:

- Cap at a reasonable depth (2-3 passes recommended)
- Apply decreasing weights per pass
- Exclude high-frequency, context-ambiguous terms

## Architecture

### Lexicon Structure

```typescript
interface Lexicon {
  // Domain-specific synonym mappings
  synonyms: SynonymEntry[];

  // Module-specific overrides
  moduleOverrides?: Record<string, Partial<Lexicon>>;
}

interface SynonymEntry {
  term: string;
  synonyms: Array<{
    term: string;
    grade: "strong" | "moderate" | "weak";
  }>;
  context?: string; // Optional: limit to specific contexts
}
```

### Integration Points

#### At Index Time (Optional)

1. Pre-expand indexed terms for faster query-time matching
2. Store expansion metadata for debugging/explainability

#### At Query Time

1. Tokenize query into terms
2. Expand terms using the lexicon
3. Apply graded weights to expanded terms
4. Execute search with weighted expanded query

### Example Flow

**Query**: `"find auth function"`

1. **Term tokenization**: `["find", "auth", "function"]`
2. **Term expansion**:
   - `find` → `search`, `locate` (moderate)
   - `auth` → `authentication`, `authorization` (strong), `login`, `security` (weak)
   - `function` → `method` (strong), `handler`, `callback` (moderate)
3. **Weighted query construction**:
   ```
   Original terms:    weight = 1.0
   Strong synonyms:   weight = 0.9
   Moderate synonyms: weight = 0.6
   Weak synonyms:     weight = 0.3
   ```
4. **Search execution**: Semantic search with expanded, weighted terms
5. **Result scoring**:
   ```
   score = Σ(term_match_score * term_weight)
   ```

## Benefits

1. **No retraining required**: Domain knowledge is added through configuration
2. **Explainable**: Expansions can be logged and inspected
3. **Modular**: Different modules can have different lexicons
4. **Incremental**: Start with a small lexicon and expand based on usage patterns
5. **Controllable**: Weights and grades can be tuned per deployment

## Risks and Mitigations

| Risk                                 | Mitigation                                          |
| ------------------------------------ | --------------------------------------------------- |
| Over-expansion introduces noise      | Cap expansion depth, use conservative weights       |
| Ambiguous terms in multiple contexts | Context-scoped synonyms, module-specific overrides  |
| Maintenance burden of lexicon        | Start small, consider auto-generation from codebase |
| Performance overhead                 | Pre-compute expansions, cache at query time         |

## Open Questions

1. Should the lexicon be per-project or global with overrides?
2. How do we handle conflicting synonym definitions across modules?
3. Should we auto-generate lexicon entries from code analysis?
4. What's the right balance between recall (more expansions) and precision (fewer, higher-quality)?

## Relationship to Literal Boosting

SSE and [Literal Boosting](./literal-boosting.md) are complementary but separate concerns:

| Aspect          | Structured Semantic Expansion | Literal Boosting               |
| --------------- | ----------------------------- | ------------------------------ |
| **Goal**        | Broaden search (recall)       | Preserve exactness (precision) |
| **Direction**   | Term → related terms          | Term → itself                  |
| **Data source** | Curated lexicon               | Auto-extracted from code       |

They integrate at the scoring layer, with SSE expanding the search surface while Literal Boosting ensures exact matches are prioritized.

## Future Considerations

- **Learning from usage**: Track which expansions lead to successful searches
- **Auto-generated synonyms**: Extract common patterns from codebase
- **User feedback loop**: Allow users to refine synonym grades based on result quality
- **Cross-language support**: Different lexicons for TypeScript, Python, etc.
- **Negative synonyms**: Terms that should _not_ be associated despite surface similarity

## References

- Query expansion techniques in information retrieval
- Synonym-based search improvements in Elasticsearch
- Domain-specific language models and their limitations
