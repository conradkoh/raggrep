/**
 * Query Literal Parser
 *
 * Parses search queries to extract literals for exact-match boosting.
 * Supports explicit detection (backticks, quotes) and implicit detection (casing patterns).
 *
 * This is a pure domain service with no external dependencies.
 */

import type {
  DetectedLiteral,
  QueryLiteralParseResult,
  LiteralType,
  LiteralConfidence,
  LiteralDetectionMethod,
} from "../entities/literal";

/**
 * Pattern definitions for implicit literal detection.
 */
interface ImplicitPattern {
  /** Regex pattern to match */
  pattern: RegExp;
  /** Confidence level for matches */
  confidence: LiteralConfidence;
  /** Inferred type for matches */
  inferredType: LiteralType;
  /** Minimum length for valid match */
  minLength?: number;
}

/**
 * Implicit detection patterns ordered by specificity.
 *
 * PascalCase: AuthService, UserRepository (2+ capital transitions)
 * camelCase: getUserById, handleLogin (lowercase start, then capital)
 * SCREAMING_SNAKE: MAX_RETRIES, API_KEY (all caps with underscores)
 * snake_case: user_auth, get_user (lowercase with underscores)
 * kebab-case: auth-service, user-auth (lowercase with hyphens)
 */
const IMPLICIT_PATTERNS: ImplicitPattern[] = [
  // PascalCase: Must have at least one capital after the first letter
  // e.g., AuthService, UserRepository, MyClass
  {
    pattern: /\b([A-Z][a-z]+(?:[A-Z][a-z0-9]*)+)\b/g,
    confidence: "medium",
    inferredType: "className",
    minLength: 3,
  },
  // camelCase: Starts lowercase, has at least one capital
  // e.g., getUserById, handleLogin, myFunction
  {
    pattern: /\b([a-z][a-z0-9]*(?:[A-Z][a-zA-Z0-9]*)+)\b/g,
    confidence: "medium",
    inferredType: "functionName",
    minLength: 3,
  },
  // SCREAMING_SNAKE_CASE: All caps with underscores
  // e.g., MAX_RETRIES, API_KEY, DEFAULT_TIMEOUT
  {
    pattern: /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g,
    confidence: "medium",
    inferredType: "variableName",
    minLength: 3,
  },
  // snake_case: All lowercase with underscores
  // e.g., user_auth, get_user_by_id
  {
    pattern: /\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g,
    confidence: "low",
    inferredType: "identifier",
    minLength: 3,
  },
  // kebab-case: All lowercase with hyphens
  // e.g., auth-service, user-auth-middleware
  // Exclude patterns that look like URLs or file paths
  {
    pattern: /(?<![/:.])\b([a-z][a-z0-9]*(?:-[a-z0-9]+)+)\b(?![/:])/g,
    confidence: "low",
    inferredType: "packageName",
    minLength: 3,
  },
];

/**
 * Parse a search query to extract literals.
 *
 * Detects:
 * - Explicit literals: `backticks` or "quotes"
 * - Implicit literals: PascalCase, camelCase, SCREAMING_SNAKE, snake_case, kebab-case
 *
 * @param query - The search query to parse
 * @returns Detected literals and remaining query for semantic search
 */
export function parseQueryLiterals(query: string): QueryLiteralParseResult {
  if (!query || query.trim() === "") {
    return { literals: [], remainingQuery: "" };
  }

  const literals: DetectedLiteral[] = [];
  let remainingQuery = query;

  // Track positions that have been matched to avoid duplicates
  const matchedPositions = new Set<string>();

  // 1. Extract explicit backtick literals
  const backtickResult = extractExplicitLiterals(
    remainingQuery,
    /`([^`]+)`/g,
    "explicit-backtick",
    matchedPositions
  );
  literals.push(...backtickResult.literals);
  remainingQuery = backtickResult.remainingQuery;

  // 2. Extract explicit quoted literals
  const quoteResult = extractExplicitLiterals(
    remainingQuery,
    /"([^"]+)"/g,
    "explicit-quote",
    matchedPositions
  );
  literals.push(...quoteResult.literals);
  remainingQuery = quoteResult.remainingQuery;

  // 3. Extract implicit literals from the ORIGINAL query
  // (we keep implicit literals in remainingQuery for semantic search)
  const implicitLiterals = extractImplicitLiterals(query, matchedPositions);
  literals.push(...implicitLiterals);

  return {
    literals,
    remainingQuery: remainingQuery.trim(),
  };
}

/**
 * Extract explicit literals (backticks or quotes) from query.
 */
function extractExplicitLiterals(
  query: string,
  pattern: RegExp,
  method: LiteralDetectionMethod,
  matchedPositions: Set<string>
): { literals: DetectedLiteral[]; remainingQuery: string } {
  const literals: DetectedLiteral[] = [];
  let remainingQuery = query;

  // Reset regex state
  pattern.lastIndex = 0;

  let match: RegExpExecArray | null;
  const replacements: Array<{ start: number; end: number; text: string }> = [];

  while ((match = pattern.exec(query)) !== null) {
    const value = match[1];
    const rawValue = match[0];

    // Skip empty matches
    if (!value || value.trim() === "") {
      continue;
    }

    // Track this position to avoid implicit detection of same term
    const posKey = `${match.index}:${match.index + rawValue.length}`;
    matchedPositions.add(posKey);

    // Also track the value itself to help avoid duplicates
    matchedPositions.add(`value:${value.toLowerCase()}`);

    literals.push({
      value,
      rawValue,
      confidence: "high",
      detectionMethod: method,
      // Don't infer type for explicit - user knows what they want
      inferredType: inferTypeFromValue(value),
    });

    replacements.push({
      start: match.index,
      end: match.index + rawValue.length,
      text: "",
    });
  }

  // Apply replacements in reverse order to maintain positions
  replacements
    .sort((a, b) => b.start - a.start)
    .forEach((r) => {
      remainingQuery =
        remainingQuery.slice(0, r.start) + r.text + remainingQuery.slice(r.end);
    });

  return { literals, remainingQuery };
}

/**
 * Extract implicit literals based on casing patterns.
 */
function extractImplicitLiterals(
  query: string,
  matchedPositions: Set<string>
): DetectedLiteral[] {
  const literals: DetectedLiteral[] = [];
  const seenValues = new Set<string>();

  for (const patternDef of IMPLICIT_PATTERNS) {
    // Reset regex state
    patternDef.pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = patternDef.pattern.exec(query)) !== null) {
      const value = match[1];

      // Skip if too short
      if (patternDef.minLength && value.length < patternDef.minLength) {
        continue;
      }

      // Skip if this position was already matched by explicit pattern
      const posKey = `${match.index}:${match.index + value.length}`;
      if (matchedPositions.has(posKey)) {
        continue;
      }

      // Skip if value was already matched explicitly
      if (matchedPositions.has(`value:${value.toLowerCase()}`)) {
        continue;
      }

      // Skip if we've already seen this value (from another pattern)
      const lowerValue = value.toLowerCase();
      if (seenValues.has(lowerValue)) {
        continue;
      }
      seenValues.add(lowerValue);

      // Skip common false positives
      if (isCommonWord(value)) {
        continue;
      }

      literals.push({
        value,
        rawValue: value,
        confidence: patternDef.confidence,
        detectionMethod: "implicit-casing",
        inferredType: patternDef.inferredType,
      });
    }
  }

  return literals;
}

/**
 * Infer type from value pattern (for explicit literals).
 */
function inferTypeFromValue(value: string): LiteralType | undefined {
  // Check each pattern
  if (/^[A-Z][a-z]+(?:[A-Z][a-z0-9]*)+$/.test(value)) {
    return "className";
  }
  if (/^[a-z][a-z0-9]*(?:[A-Z][a-zA-Z0-9]*)+$/.test(value)) {
    return "functionName";
  }
  if (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(value)) {
    return "variableName";
  }
  if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(value)) {
    return "identifier";
  }
  if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(value)) {
    return "packageName";
  }
  // Can't infer type
  return undefined;
}

/**
 * Check if a word is a common English word that shouldn't be detected as a literal.
 *
 * This helps avoid false positives for words like "Find", "The", etc.
 * that might be capitalized at the start of a sentence.
 */
function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    // Common sentence starters
    "find",
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "what",
    "where",
    "when",
    "how",
    "why",
    "which",
    "who",
    "this",
    "that",
    "these",
    "those",
    "and",
    "or",
    "but",
    "for",
    "with",
    "from",
    "to",
    "in",
    "on",
    "at",
    "by",
    "of",
    "all",
    "any",
    "some",
    // Common programming terms that shouldn't be literals alone
    "get",
    "set",
    "new",
    "class",
    "function",
    "const",
    "let",
    "var",
    "type",
    "interface",
    "import",
    "export",
    "default",
    "return",
    "async",
    "await",
    "null",
    "undefined",
    "true",
    "false",
  ]);

  return commonWords.has(word.toLowerCase());
}
