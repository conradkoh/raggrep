/**
 * Literal Scorer
 *
 * Calculates multiplicative score boosts for literal matches.
 * Implements the three-source merge strategy for literal boosting.
 *
 * This is a pure domain service with no external dependencies.
 */

import type {
  LiteralMatch,
  LiteralMatchType,
  LiteralConfidence,
  LITERAL_SCORING,
} from "../entities/literal";

/**
 * Scoring constants for literal boosting.
 */
export const LITERAL_SCORING_CONSTANTS = {
  /** Base score for chunks found only via literal index */
  BASE_SCORE: 0.5,

  /** Multipliers by match type and confidence */
  MULTIPLIERS: {
    definition: { high: 2.5, medium: 2.0, low: 1.5 },
    reference: { high: 2.0, medium: 1.5, low: 1.3 },
    import: { high: 1.5, medium: 1.3, low: 1.1 },
  } as Record<LiteralMatchType, Record<LiteralConfidence, number>>,

  /** Vocabulary match scoring */
  VOCABULARY: {
    /** Base multiplier for vocabulary-only matches (no exact literal match) */
    BASE_MULTIPLIER: 1.3,
    /** Bonus per additional vocabulary word matched (up to a limit) */
    PER_WORD_BONUS: 0.1,
    /** Maximum vocabulary bonus */
    MAX_VOCABULARY_BONUS: 0.5,
    /** Minimum vocabulary words required for a match to count */
    MIN_WORDS_FOR_MATCH: 2,
  },
};

/**
 * Calculate the literal multiplier for a given match type and confidence.
 *
 * @param matchType - How the chunk relates to the literal (definition/reference/import)
 * @param confidence - Detection confidence of the query literal
 * @returns Multiplier to apply to the base score
 */
export function calculateLiteralMultiplier(
  matchType: LiteralMatchType,
  confidence: LiteralConfidence
): number {
  return LITERAL_SCORING_CONSTANTS.MULTIPLIERS[matchType][confidence];
}

/**
 * Calculate the maximum multiplier for a set of literal matches.
 *
 * When a chunk has multiple literal matches, use the highest multiplier.
 *
 * @param matches - Array of literal matches for a chunk
 * @returns The maximum multiplier, or 1.0 if no matches
 */
export function calculateMaxMultiplier(matches: LiteralMatch[]): number {
  if (!matches || matches.length === 0) {
    return 1.0;
  }

  return Math.max(
    ...matches.map((m) =>
      calculateLiteralMultiplier(
        m.indexedLiteral.matchType,
        m.queryLiteral.confidence
      )
    )
  );
}

/**
 * Result of vocabulary-based matching.
 */
export interface VocabularyMatchResult {
  /** Number of vocabulary words that matched */
  matchedWordCount: number;
  /** The vocabulary words that matched */
  matchedWords: string[];
  /** Multiplier to apply based on vocabulary match */
  multiplier: number;
  /** Whether this is a meaningful match (above threshold) */
  isSignificant: boolean;
}

/**
 * Calculate vocabulary-based scoring for a chunk.
 *
 * This is used for partial matching when no exact literal match exists.
 * E.g., query "user authentication" might match chunk with "getUserAuth" literal.
 *
 * @param queryVocabulary - Vocabulary words extracted from the query
 * @param chunkVocabulary - Vocabulary words extracted from chunk literals
 * @returns Vocabulary match result with multiplier
 */
export function calculateVocabularyMatch(
  queryVocabulary: string[],
  chunkVocabulary: string[]
): VocabularyMatchResult {
  if (
    !queryVocabulary ||
    queryVocabulary.length === 0 ||
    !chunkVocabulary ||
    chunkVocabulary.length === 0
  ) {
    return {
      matchedWordCount: 0,
      matchedWords: [],
      multiplier: 1.0,
      isSignificant: false,
    };
  }

  // Find matching vocabulary words
  const querySet = new Set(queryVocabulary.map((w) => w.toLowerCase()));
  const matchedWords: string[] = [];

  for (const word of chunkVocabulary) {
    if (querySet.has(word.toLowerCase())) {
      matchedWords.push(word);
    }
  }

  const matchedWordCount = matchedWords.length;

  // Check if match is significant
  const isSignificant =
    matchedWordCount >= LITERAL_SCORING_CONSTANTS.VOCABULARY.MIN_WORDS_FOR_MATCH;

  // Calculate multiplier
  let multiplier = 1.0;
  if (isSignificant) {
    multiplier = LITERAL_SCORING_CONSTANTS.VOCABULARY.BASE_MULTIPLIER;
    // Add bonus for additional words (above minimum)
    const extraWords =
      matchedWordCount - LITERAL_SCORING_CONSTANTS.VOCABULARY.MIN_WORDS_FOR_MATCH;
    const bonus = Math.min(
      extraWords * LITERAL_SCORING_CONSTANTS.VOCABULARY.PER_WORD_BONUS,
      LITERAL_SCORING_CONSTANTS.VOCABULARY.MAX_VOCABULARY_BONUS
    );
    multiplier += bonus;
  }

  return {
    matchedWordCount,
    matchedWords,
    multiplier,
    isSignificant,
  };
}

/**
 * Score contribution from literal matches.
 * Used for debugging and explainability.
 */
export interface LiteralScoreContribution {
  /** The multiplier applied */
  multiplier: number;

  /** Whether this is a literal-only match (not found by semantic/BM25) */
  literalOnly: boolean;

  /** Match type of the best match */
  bestMatchType?: LiteralMatchType;

  /** Confidence of the best match */
  bestConfidence?: LiteralConfidence;

  /** Number of literal matches */
  matchCount: number;
}

/**
 * Calculate the literal score contribution for a chunk.
 *
 * @param matches - Literal matches for the chunk (may be empty)
 * @param hasSemanticOrBm25 - Whether the chunk was found by semantic or BM25 search
 * @returns Score contribution details
 */
export function calculateLiteralContribution(
  matches: LiteralMatch[],
  hasSemanticOrBm25: boolean
): LiteralScoreContribution {
  if (!matches || matches.length === 0) {
    return {
      multiplier: 1.0,
      literalOnly: false,
      matchCount: 0,
    };
  }

  // Find the best match (highest multiplier)
  let bestMatch: LiteralMatch | null = null;
  let bestMultiplier = 0;

  for (const match of matches) {
    const mult = calculateLiteralMultiplier(
      match.indexedLiteral.matchType,
      match.queryLiteral.confidence
    );
    if (mult > bestMultiplier) {
      bestMultiplier = mult;
      bestMatch = match;
    }
  }

  return {
    multiplier: bestMultiplier,
    literalOnly: !hasSemanticOrBm25,
    bestMatchType: bestMatch?.indexedLiteral.matchType,
    bestConfidence: bestMatch?.queryLiteral.confidence,
    matchCount: matches.length,
  };
}

/**
 * Apply literal boosting to a base score.
 *
 * Scoring rules:
 * - If chunk has both semantic/BM25 and literal match: multiply base by multiplier
 * - If chunk has only literal match: use BASE_SCORE
 * - If chunk has no literal match: use base score as-is
 *
 * @param baseScore - Score from semantic/BM25 search (0 if not found)
 * @param matches - Literal matches for the chunk
 * @param hasSemanticOrBm25 - Whether the chunk was found by semantic or BM25
 * @returns Final score after literal boosting
 */
export function applyLiteralBoost(
  baseScore: number,
  matches: LiteralMatch[],
  hasSemanticOrBm25: boolean
): number {
  // No literal matches - return base score
  if (!matches || matches.length === 0) {
    return baseScore;
  }

  const multiplier = calculateMaxMultiplier(matches);

  // Literal match but no semantic/BM25 - use base score
  if (!hasSemanticOrBm25) {
    return LITERAL_SCORING_CONSTANTS.BASE_SCORE * multiplier;
  }

  // Has both - multiply the base score
  return baseScore * multiplier;
}

/**
 * Merge results from three search sources with literal boosting.
 *
 * @param semanticBm25Results - Results from semantic and BM25 search
 * @param literalMatches - Map from chunk ID to literal matches
 * @returns Results with literal boosting applied
 */
export interface MergeInput {
  /** Chunk ID */
  chunkId: string;
  /** Score from semantic/BM25 search */
  baseScore: number;
}

export interface MergeOutput extends MergeInput {
  /** Final score after literal boosting */
  finalScore: number;
  /** Literal contribution details */
  literalContribution: LiteralScoreContribution;
}

export function mergeWithLiteralBoost(
  semanticBm25Results: MergeInput[],
  literalMatchMap: Map<string, LiteralMatch[]>
): MergeOutput[] {
  const results: MergeOutput[] = [];
  const processedChunks = new Set<string>();

  // Process results that have semantic/BM25 scores
  for (const result of semanticBm25Results) {
    const matches = literalMatchMap.get(result.chunkId) || [];
    const contribution = calculateLiteralContribution(matches, true);
    const finalScore = applyLiteralBoost(result.baseScore, matches, true);

    results.push({
      ...result,
      finalScore,
      literalContribution: contribution,
    });
    processedChunks.add(result.chunkId);
  }

  // Add literal-only results (not found by semantic/BM25)
  for (const [chunkId, matches] of literalMatchMap) {
    if (processedChunks.has(chunkId)) {
      continue;
    }

    const contribution = calculateLiteralContribution(matches, false);
    const finalScore = applyLiteralBoost(0, matches, false);

    results.push({
      chunkId,
      baseScore: 0,
      finalScore,
      literalContribution: contribution,
    });
  }

  return results;
}
