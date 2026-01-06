/**
 * Phrase Matching Service
 *
 * Pure functions for content-based phrase matching. This enables
 * exact phrase searches to find results even when semantic/BM25
 * scores are low.
 *
 * @module domain/services/phraseMatch
 */

/**
 * Result of phrase matching analysis.
 */
export interface PhraseMatchResult {
  /** Whether the exact query phrase was found in content */
  exactMatch: boolean;
  /** Proportion of query tokens found in content (0-1) */
  coverage: number;
  /** Number of query tokens found in content */
  matchedTokenCount: number;
  /** Total number of tokens in query */
  totalTokenCount: number;
  /** Additive score boost based on match quality */
  boost: number;
  /** Whether this match is significant enough to bypass filters */
  isSignificant: boolean;
}

/**
 * Constants for phrase matching scoring.
 */
export const PHRASE_MATCH_CONSTANTS = {
  /** Major boost for exact phrase match */
  EXACT_PHRASE_BOOST: 0.5,
  /** Boost for high token coverage (80%+) */
  HIGH_COVERAGE_BOOST: 0.2,
  /** Boost for medium token coverage (60%+) */
  MEDIUM_COVERAGE_BOOST: 0.1,
  /** Coverage threshold for "high" classification */
  HIGH_COVERAGE_THRESHOLD: 0.8,
  /** Coverage threshold for "medium" classification */
  MEDIUM_COVERAGE_THRESHOLD: 0.6,
  /** Minimum query length to consider for exact matching */
  MIN_QUERY_LENGTH: 3,
} as const;

/**
 * Stop words to filter from query when calculating token coverage.
 * These are common words that don't contribute much to matching quality.
 */
const PHRASE_STOP_WORDS = new Set([
  // Articles
  "a",
  "an",
  "the",
  // Prepositions
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "as",
  // Conjunctions
  "and",
  "or",
  "but",
  // Question words (keep for exact matching, filter for coverage)
  "what",
  "where",
  "when",
  "how",
  "why",
  "which",
  "who",
  // Common verbs
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  // Pronouns
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "this",
  "that",
  "these",
  "those",
]);

/**
 * Tokenize a string into words for matching.
 * Normalizes to lowercase and filters out punctuation.
 *
 * @param text - Text to tokenize
 * @param filterStopWords - Whether to filter out stop words
 * @returns Array of normalized tokens
 */
export function tokenizeForMatching(
  text: string,
  filterStopWords = true
): string[] {
  if (!text || text.trim() === "") {
    return [];
  }

  const tokens = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ") // Replace punctuation with spaces
    .split(/\s+/)
    .filter((t) => t.length > 1); // Filter single-character tokens

  if (filterStopWords) {
    return tokens.filter((t) => !PHRASE_STOP_WORDS.has(t));
  }

  return tokens;
}

/**
 * Calculate phrase match score for content against a query.
 *
 * This function checks:
 * 1. Exact phrase match (query substring in content)
 * 2. Token coverage (what % of query tokens appear in content)
 *
 * @param content - The chunk content to search in
 * @param query - The search query
 * @returns PhraseMatchResult with match details and boost
 *
 * @example
 * const result = calculatePhraseMatch(
 *   "This explains the authentication flow for new users",
 *   "authentication flow for new users"
 * );
 * // result.exactMatch = true
 * // result.boost = 0.5 (EXACT_PHRASE_BOOST)
 *
 * @example
 * const result = calculatePhraseMatch(
 *   "User authentication and session flow",
 *   "authentication flow for users"
 * );
 * // result.exactMatch = false
 * // result.coverage = 0.75 (3/4 tokens found)
 * // result.boost = 0.1 (MEDIUM_COVERAGE_BOOST)
 */
export function calculatePhraseMatch(
  content: string,
  query: string
): PhraseMatchResult {
  // Handle empty inputs
  if (!content || !query || query.trim().length < PHRASE_MATCH_CONSTANTS.MIN_QUERY_LENGTH) {
    return {
      exactMatch: false,
      coverage: 0,
      matchedTokenCount: 0,
      totalTokenCount: 0,
      boost: 0,
      isSignificant: false,
    };
  }

  const contentLower = content.toLowerCase();
  const queryLower = query.toLowerCase().trim();

  // 1. Check for exact phrase match
  const exactMatch = contentLower.includes(queryLower);

  // 2. Calculate token coverage (filtering stop words for better accuracy)
  const queryTokens = tokenizeForMatching(query, true);
  const matchedTokens = queryTokens.filter((token) =>
    contentLower.includes(token)
  );
  const coverage =
    queryTokens.length > 0 ? matchedTokens.length / queryTokens.length : 0;

  // 3. Calculate boost based on match quality
  let boost = 0;
  if (exactMatch) {
    boost = PHRASE_MATCH_CONSTANTS.EXACT_PHRASE_BOOST;
  } else if (coverage >= PHRASE_MATCH_CONSTANTS.HIGH_COVERAGE_THRESHOLD) {
    boost = PHRASE_MATCH_CONSTANTS.HIGH_COVERAGE_BOOST;
  } else if (coverage >= PHRASE_MATCH_CONSTANTS.MEDIUM_COVERAGE_THRESHOLD) {
    boost = PHRASE_MATCH_CONSTANTS.MEDIUM_COVERAGE_BOOST;
  }

  // 4. Determine if match is significant enough to bypass filters
  const isSignificant =
    exactMatch || coverage >= PHRASE_MATCH_CONSTANTS.HIGH_COVERAGE_THRESHOLD;

  return {
    exactMatch,
    coverage,
    matchedTokenCount: matchedTokens.length,
    totalTokenCount: queryTokens.length,
    boost,
    isSignificant,
  };
}

/**
 * Quick check if content might contain the query phrase.
 * Useful for early filtering before full phrase matching.
 *
 * @param content - The chunk content
 * @param query - The search query
 * @returns true if exact phrase is found
 */
export function hasExactPhrase(content: string, query: string): boolean {
  if (!content || !query || query.trim().length < PHRASE_MATCH_CONSTANTS.MIN_QUERY_LENGTH) {
    return false;
  }
  return content.toLowerCase().includes(query.toLowerCase().trim());
}

/**
 * Calculate token coverage between content and query.
 * Faster than full phrase matching when only coverage is needed.
 *
 * @param content - The chunk content
 * @param query - The search query
 * @returns Coverage ratio (0-1)
 */
export function calculateTokenCoverage(content: string, query: string): number {
  if (!content || !query) {
    return 0;
  }

  const contentLower = content.toLowerCase();
  const queryTokens = tokenizeForMatching(query, true);

  if (queryTokens.length === 0) {
    return 0;
  }

  const matchedCount = queryTokens.filter((token) =>
    contentLower.includes(token)
  ).length;

  return matchedCount / queryTokens.length;
}

