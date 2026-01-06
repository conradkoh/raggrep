# Vocabulary-Based Scoring

## Status: Proposed

## Problem Statement

Long queries with phrase matches are scoring poorly or not appearing in results at all.

### Example

Query: `"where is the user authentication session validated"`

Expected: A chunk containing `validateUserSession()` or text about "user authentication session" should rank highly.

Actual: The chunk doesn't appear in results because:

1. **Semantic score is low** — Long query embeddings are diluted, producing low cosine similarity
2. **BM25 score is spread thin** — Score distributed across 7+ tokens
3. **Literal index misses** — No identifier exactly matches the full phrase
4. **Result filtered out** — Falls below `minScore` threshold (0.15)

### Root Cause

The current filtering logic requires at least one of:
- `finalScore >= minScore` (fails due to dilution)
- `bm25Score > 0.3` (fails due to token spread)
- `literalMatches.length > 0` (fails — no exact identifier match)

**Critical gap**: The vocabulary index infrastructure exists but is NOT used during search. Functions like `findByVocabularyWords()` and `calculateVocabularyMatch()` are defined but never called.

## Current Architecture

```
Query: "where is user authentication validated"
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
┌─────────┐   ┌─────────┐   ┌─────────────┐
│Semantic │   │  BM25   │   │   Literal   │
│Embedding│   │ Keyword │   │    Index    │
└────┬────┘   └────┬────┘   └──────┬──────┘
     │             │               │
     │ cosine      │ term freq     │ exact match
     │ similarity  │ + IDF         │ lookup
     ▼             ▼               ▼
┌─────────────────────────────────────────┐
│           Score Combination             │
│                                         │
│  base = 0.7 × semantic + 0.3 × bm25     │
│  final = base × literalMultiplier       │
│                                         │
│  Filter: final >= 0.15 OR bm25 > 0.3    │
│          OR literalMatches > 0          │
└─────────────────────────────────────────┘
                    │
                    ▼
            Filtered Results
            (missing good matches!)
```

### What's Missing

The **vocabulary index** stores decomposed identifier vocabulary:

```
"validateUserSession" → vocabulary: ["validate", "user", "session"]
"authenticateUser"    → vocabulary: ["authenticate", "user"]
"SessionValidator"    → vocabulary: ["session", "validator"]
```

But this vocabulary data is never queried during search. A query containing "user", "authentication", "session" should find chunks with overlapping vocabulary.

## Proposed Solution

### Architecture

Add vocabulary scoring as a **fourth retrieval signal**:

```
Query: "where is user authentication validated"
                    │
    ┌───────────────┼───────────────┬───────────────┐
    ▼               ▼               ▼               ▼
┌─────────┐   ┌─────────┐   ┌─────────────┐   ┌─────────────┐
│Semantic │   │  BM25   │   │   Literal   │   │ Vocabulary  │
│Embedding│   │ Keyword │   │    Index    │   │   Index     │
└────┬────┘   └────┬────┘   └──────┬──────┘   └──────┬──────┘
     │             │               │                 │
     │             │               │                 │ vocabulary
     │             │               │                 │ overlap
     ▼             ▼               ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                    Score Combination                         │
│                                                              │
│  For each component, apply literal boosting:                 │
│    semanticBoosted = semantic × literalMult                  │
│    bm25Boosted = bm25 × literalMult                          │
│    vocabScore = vocabularyOverlap × literalMult              │
│                                                              │
│  Weighted sum:                                               │
│    final = w_s × semanticBoosted                             │
│          + w_b × bm25Boosted                                 │
│          + w_v × vocabScore                                  │
│          + additiveBoosts                                    │
│                                                              │
│  Filter: final >= minScore                                   │
│          OR bm25 > threshold                                 │
│          OR literalMatches > 0                               │
│          OR vocabScore > threshold  ← NEW                    │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
            Complete Results
            (includes vocabulary matches!)
```

### Vocabulary Scoring

#### 1. Extract Query Vocabulary

```typescript
function extractQueryVocabulary(query: string): string[] {
  // Tokenize and normalize query
  const tokens = tokenize(query);  // ["where", "is", "user", "authentication", "validated"]
  
  // Filter stop words
  const meaningful = tokens.filter(t => !isStopWord(t));  // ["user", "authentication", "validated"]
  
  // Extract vocabulary from any detected identifiers
  const identifierVocab = parseQueryLiterals(query).literals
    .flatMap(lit => extractVocabulary(lit.value));
  
  return [...new Set([...meaningful, ...identifierVocab])];
}
```

#### 2. Query Vocabulary Index

Use existing `LiteralIndex.findByVocabularyWords()`:

```typescript
// Already implemented in literalIndex.ts
const vocabMatches = literalIndex.findByVocabularyWords(queryVocabulary);
// Returns: Array<{ entry: LiteralIndexEntry, matchedWords: string[] }>
```

#### 3. Calculate Vocabulary Score

Use existing `calculateVocabularyMatch()`:

```typescript
// For each chunk with vocabulary matches:
const vocabResult = calculateVocabularyMatch(queryVocabulary, chunkVocabulary);
// Returns: { matchedWordCount, matchedWords, multiplier, isSignificant }

// Score based on overlap
const vocabScore = vocabResult.matchedWordCount / queryVocabulary.length;
```

#### 4. Apply Literal Boosting Uniformly

All scoring components get the same literal boosting treatment:

```typescript
const literalMultiplier = calculateMaxMultiplier(literalMatches);

// Each component is boosted if literal matches exist
const semanticBoosted = semanticScore * literalMultiplier;
const bm25Boosted = bm25Score * literalMultiplier;
const vocabBoosted = vocabScore * literalMultiplier;

// Weighted combination
const SEMANTIC_WEIGHT = 0.5;  // Reduced from 0.7
const BM25_WEIGHT = 0.3;      // Unchanged
const VOCAB_WEIGHT = 0.2;     // New

const finalScore = SEMANTIC_WEIGHT * semanticBoosted
                 + BM25_WEIGHT * bm25Boosted
                 + VOCAB_WEIGHT * vocabBoosted
                 + additiveBoosts;
```

### Filtering Changes

Add vocabulary score as a filter bypass:

```typescript
const VOCAB_THRESHOLD = 0.5;  // 50% vocabulary overlap

if (
  finalScore >= minScore ||
  bm25Score > 0.3 ||
  literalMatches.length > 0 ||
  vocabScore > VOCAB_THRESHOLD  // NEW: Include vocabulary matches
) {
  results.push(...);
}
```

### Weight Calibration

| Scenario | Semantic | BM25 | Vocab | Expected Winner |
|----------|----------|------|-------|-----------------|
| Conceptual query ("how does auth work") | High | Low | Low | Semantic |
| Keyword query ("redis cache") | Med | High | Med | BM25 |
| Identifier query ("getUserById") | Low | Med | High | Vocab + Literal |
| Long phrase ("user authentication session") | Low | Low | High | Vocab |

Proposed weights: `[0.5, 0.3, 0.2]` for `[semantic, bm25, vocab]`

These can be tuned based on test results.

## Implementation Plan

### Phase 1: Wire Up Vocabulary Index

1. In `TypeScriptModule.search()`:
   - Extract vocabulary from query
   - Call `literalIndex.findByVocabularyWords()`
   - Build vocabulary match map (chunkId → vocab score)

2. Add vocabulary score to scoring loop:
   - Look up vocab score for each chunk
   - Apply literal boosting
   - Include in weighted sum

3. Add vocabulary threshold to filter:
   - Chunks with high vocab overlap bypass minScore

### Phase 2: Uniform Literal Boosting

1. Refactor to apply literal multiplier to each component separately
2. Then combine with weighted sum
3. This gives consistent treatment across all signals

### Phase 3: Tuning & Testing

1. Add ranking tests for long phrase queries
2. Calibrate weights based on test results
3. Consider making weights configurable

## Files to Modify

### Domain Layer
- `src/domain/services/index.ts` — Export new functions if needed

### Module Layer  
- `src/modules/language/typescript/index.ts` — Main search changes

### Tests
- `src/tests/ranking.test.ts` — Add long phrase query tests
- New test file for vocabulary scoring edge cases

## Success Criteria

1. Query `"where is user authentication validated"` finds `validateUserSession`
2. Query `"database connection pool configuration"` finds `configureConnectionPool`
3. Existing ranking tests continue to pass
4. No significant performance regression (vocabulary lookup is O(1) per word)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Vocabulary matches too aggressive | Use threshold (e.g., 50% overlap required) |
| Weight imbalance | Start conservative, tune with tests |
| Performance impact | Vocabulary index is in-memory, O(1) lookup |
| Over-boosting partial matches | Vocabulary score is proportional to overlap |

## Future Considerations

1. **Phrase proximity**: Boost when vocabulary words appear close together in content
2. **Query intent detection**: Adjust weights based on query type
3. **Configurable weights**: Allow users to tune via config
4. **Cross-language**: Apply same approach to other language modules

