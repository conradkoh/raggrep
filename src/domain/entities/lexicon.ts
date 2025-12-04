/**
 * Lexicon Types
 *
 * Type definitions for Structured Semantic Expansion (SSE).
 * SSE improves search recall by expanding query terms with domain-specific synonyms.
 *
 * This is a pure domain entity with no external dependencies.
 */

/**
 * Correlation grade for synonyms.
 * Determines how much weight a synonym contributes to scoring.
 *
 * - strong: Near-equivalent concepts (function ↔ method)
 * - moderate: Related but distinct (function ↔ handler)
 * - weak: Loosely associated (auth ↔ security)
 */
export type SynonymGrade = "strong" | "moderate" | "weak";

/**
 * A single synonym with its correlation grade.
 */
export interface Synonym {
  /** The synonym term */
  term: string;

  /** Correlation strength with the parent term */
  grade: SynonymGrade;
}

/**
 * A synonym entry in the lexicon.
 */
export interface SynonymEntry {
  /** The canonical term */
  term: string;

  /** Synonyms with their correlation grades */
  synonyms: Synonym[];

  /** Optional context restriction (e.g., "typescript", "database") */
  context?: string;
}

/**
 * The lexicon containing all synonym mappings.
 */
export interface Lexicon {
  /** Version for compatibility checking */
  version: string;

  /** All synonym entries */
  entries: SynonymEntry[];

  /** Optional module-specific overrides */
  moduleOverrides?: Record<string, SynonymEntry[]>;
}

/**
 * An expanded term with weight information.
 */
export interface ExpandedTerm {
  /** The term (original or synonym) */
  term: string;

  /** Weight for scoring (1.0 for original, lower for synonyms) */
  weight: number;

  /** How this term was derived */
  source: "original" | "strong" | "moderate" | "weak";

  /** The original term this was expanded from (if synonym) */
  expandedFrom?: string;
}

/**
 * Result of expanding a query.
 */
export interface ExpandedQuery {
  /** Original query string */
  originalQuery: string;

  /** Original query terms (tokenized) */
  originalTerms: string[];

  /** All terms including expansions with weights */
  expandedTerms: ExpandedTerm[];

  /** Query string with expansions (for embedding) */
  expandedQueryString: string;

  /** Whether any expansion occurred */
  wasExpanded: boolean;
}

/**
 * Options for query expansion.
 */
export interface ExpansionOptions {
  /** Maximum expansion depth (passes). Default: 1 */
  maxDepth?: number;

  /** Include weak synonyms. Default: true */
  includeWeak?: boolean;

  /** Maximum total terms after expansion. Default: 20 */
  maxTerms?: number;

  /** Minimum term length to expand. Default: 2 */
  minTermLength?: number;

  /** Context filter (only use entries matching this context) */
  context?: string;
}

/**
 * Default expansion options.
 */
export const DEFAULT_EXPANSION_OPTIONS: Required<
  Omit<ExpansionOptions, "context">
> = {
  maxDepth: 1,
  includeWeak: true,
  maxTerms: 20,
  minTermLength: 2,
};

/**
 * Weights applied to synonyms by grade.
 */
export const EXPANSION_WEIGHTS: Record<SynonymGrade, number> = {
  strong: 0.9,
  moderate: 0.6,
  weak: 0.3,
};
