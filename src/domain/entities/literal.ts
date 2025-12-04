/**
 * Literal Entity
 *
 * Types for literal boosting - exact-match term detection and scoring.
 * Supports both query literal detection and code literal extraction.
 */

/**
 * Types of literals that can be extracted from code.
 */
export type LiteralType =
  | "className"
  | "functionName"
  | "variableName"
  | "interfaceName"
  | "typeName"
  | "enumName"
  | "packageName"
  | "identifier";

/**
 * How the chunk relates to the literal.
 * Used for scoring - definitions rank higher than references.
 */
export type LiteralMatchType =
  | "definition" // Chunk IS the literal (e.g., class AuthService {})
  | "reference" // Chunk USES the literal (e.g., new AuthService())
  | "import"; // Chunk imports the literal

/**
 * Confidence level for detected literals.
 */
export type LiteralConfidence = "high" | "medium" | "low";

/**
 * How a literal was detected in a query.
 */
export type LiteralDetectionMethod =
  | "explicit-backtick" // `AuthService`
  | "explicit-quote" // "AuthService"
  | "implicit-casing"; // AuthService (PascalCase detected)

/**
 * A literal extracted from indexed code.
 */
export interface ExtractedLiteral {
  /** The exact term as it appears in code */
  value: string;

  /** Type classification */
  type: LiteralType;

  /** How this chunk relates to the literal */
  matchType: LiteralMatchType;
}

/**
 * A literal detected in a search query.
 */
export interface DetectedLiteral {
  /** The literal value (without backticks/quotes) */
  value: string;

  /** Original as it appeared in query (with backticks/quotes if explicit) */
  rawValue: string;

  /** Detection confidence */
  confidence: LiteralConfidence;

  /** How the literal was detected */
  detectionMethod: LiteralDetectionMethod;

  /** Inferred type based on pattern */
  inferredType?: LiteralType;
}

/**
 * Result of parsing a query for literals.
 */
export interface QueryLiteralParseResult {
  /** Detected literals */
  literals: DetectedLiteral[];

  /** Query with literals removed (for semantic search) */
  remainingQuery: string;
}

/**
 * A match between a query literal and an indexed literal.
 */
export interface LiteralMatch {
  /** The query literal that was matched */
  queryLiteral: DetectedLiteral;

  /** The indexed literal it matched */
  indexedLiteral: ExtractedLiteral;

  /** ID of the chunk containing this literal */
  chunkId: string;

  /** Filepath of the file containing the chunk */
  filepath: string;

  /** Whether the match is exact (case-sensitive) */
  exactMatch: boolean;
}

/**
 * Serialized format for literal index storage.
 */
export interface LiteralIndexEntry {
  chunkId: string;
  filepath: string;
  originalCasing: string;
  type: LiteralType;
  matchType: LiteralMatchType;
}

/**
 * Serialized literal index data for persistence.
 */
export interface LiteralIndexData {
  /** Schema version */
  version: string;

  /** Map from literal value (lowercase) → entries */
  entries: Record<string, LiteralIndexEntry[]>;
}

/**
 * Scoring constants for literal boosting.
 */
export const LITERAL_SCORING = {
  /** Base score for chunks found only via literal index */
  BASE_SCORE: 0.5,

  /** Multipliers by match type and confidence */
  MULTIPLIERS: {
    definition: { high: 2.5, medium: 2.0, low: 1.5 },
    reference: { high: 2.0, medium: 1.5, low: 1.3 },
    import: { high: 1.5, medium: 1.3, low: 1.1 },
  } as Record<LiteralMatchType, Record<LiteralConfidence, number>>,
};
