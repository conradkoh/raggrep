# Content-Based Phrase Matching

## Status: ✅ Implemented

## Problem Statement

Exact phrase searches fail to find results even when the phrase exists verbatim in file content.

### Example

- **Query**: "authentication flow for new users"
- **File**: `docs/authentication.md` contains the exact phrase "authentication flow for new users"
- **VSCode search**: Finds it immediately
- **raggrep search**: Returns nothing or ranks it very low

### Why Current Search Fails

1. **Semantic search**: Embeddings are fuzzy — exact phrase similarity may be low
2. **BM25**: Tokenizes into words, loses phrase ordering and proximity
3. **Literal index**: Only stores identifiers (function/class names), not arbitrary prose
4. **No content check**: Never actually checks if query appears in `chunk.content`

## Proposed Solution

Add **content-based phrase matching** as an additional scoring signal and filter bypass.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Search Pipeline                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  For each candidate chunk:                                   │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Semantic   │  │     BM25     │  │   Literal    │       │
│  │   Score      │  │    Score     │  │    Boost     │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                 │                │
│         └────────┬────────┴────────┬────────┘                │
│                  │                 │                         │
│                  ▼                 ▼                         │
│  ┌──────────────────────────────────────────────────┐       │
│  │         Content Phrase Matching (NEW)             │       │
│  │                                                   │       │
│  │  1. Exact phrase: query in content?              │       │
│  │  2. Token coverage: % of query tokens in content │       │
│  │  3. Token proximity: query words near each other │       │
│  └──────────────────────────────────────────────────┘       │
│                              │                               │
│                              ▼                               │
│                    Combined Score                            │
│                    + Filter Bypass                           │
└─────────────────────────────────────────────────────────────┘
```

### Implementation

```typescript
// Constants
const EXACT_PHRASE_BOOST = 0.5;      // Major boost for exact phrase match
const HIGH_COVERAGE_BOOST = 0.2;     // Boost for 80%+ token coverage
const PHRASE_MATCH_THRESHOLD = 0.8;  // Coverage threshold for filter bypass

// In scoring loop for each chunk:
function calculatePhraseMatchScore(
  content: string,
  query: string
): { exactMatch: boolean; coverage: number; boost: number } {
  const contentLower = content.toLowerCase();
  const queryLower = query.toLowerCase().trim();
  
  // 1. Check for exact phrase match
  const exactMatch = contentLower.includes(queryLower);
  
  // 2. Calculate token coverage
  const queryTokens = tokenize(query);
  const matchedTokens = queryTokens.filter(t => contentLower.includes(t));
  const coverage = queryTokens.length > 0 
    ? matchedTokens.length / queryTokens.length 
    : 0;
  
  // 3. Calculate boost
  let boost = 0;
  if (exactMatch) {
    boost = EXACT_PHRASE_BOOST;
  } else if (coverage >= PHRASE_MATCH_THRESHOLD) {
    boost = HIGH_COVERAGE_BOOST;
  }
  
  return { exactMatch, coverage, boost };
}

// In filter condition:
if (
  finalScore >= minScore ||
  bm25Score > 0.3 ||
  literalMatches.length > 0 ||
  phraseMatch.exactMatch ||           // NEW: Exact phrase always included
  phraseMatch.coverage > 0.8          // NEW: High coverage included
) {
  results.push(...);
}
```

### Where to Implement

This should be implemented in the **base search infrastructure** or as a **shared utility** that all modules can use:

- **Option A**: Add to each module's `search()` function
- **Option B**: Add to `src/app/search/index.ts` as a post-processing step
- **Option C**: Create a shared `phraseMatch()` utility in domain services

**Recommendation**: Option C (shared utility) + integrate into each module's search.

## Scope

### In Scope
- Exact phrase matching (query substring in content)
- Token coverage calculation
- Additive boost for phrase matches
- Filter bypass for high-coverage matches

### Out of Scope (Future)
- Token proximity scoring (words near each other)
- Fuzzy phrase matching (typo tolerance)
- Phrase position weighting (earlier = better)
- Query segmentation (detecting sub-phrases)

## Files to Modify

### Domain Layer
- `src/domain/services/phraseMatch.ts` (NEW) — Pure phrase matching algorithms

### Module Layer
- `src/modules/language/typescript/index.ts` — Integrate phrase matching
- `src/modules/docs/markdown/index.ts` — Integrate phrase matching
- Other modules as needed

### Tests
- `src/tests/phrase-matching.test.ts` (NEW) — Phrase matching tests

## Success Criteria

1. Query "authentication flow for new users" finds markdown file containing that exact phrase
2. Query "database connection pool" finds files with those words in close proximity
3. Existing ranking tests continue to pass
4. No significant performance regression (string operations on loaded chunks are fast)

## Performance Considerations

- Phrase matching only runs on **already-loaded chunks** during search
- String `includes()` is O(n*m) but chunks are typically small (<1KB)
- Only need to check top N candidates if performance is a concern
- Can short-circuit if exact match found

## Relationship to Other Features

| Feature | Purpose | Status |
|---------|---------|--------|
| **Vocabulary Scoring** | Natural language → code identifiers | In Progress |
| **Content Phrase Matching** | Exact phrases in any content | Planned |
| **Literal Boosting** | Exact identifier matches | Implemented |
| **Semantic Expansion** | Synonym broadening | Implemented |

Content phrase matching is **complementary** to vocabulary scoring:
- Vocabulary: "where is session validated" → finds `validateSession`
- Phrase: "session validation logic" → finds prose containing that phrase

