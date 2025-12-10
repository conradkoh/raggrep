/**
 * Query Intent Detection Service
 *
 * Detects whether a search query is looking for implementation code
 * or documentation, and calculates appropriate boosts.
 */

import * as path from "path";

// ============================================================================
// Constants
// ============================================================================

/** Implementation-related query terms that boost source code files */
export const IMPLEMENTATION_TERMS = [
  "function",
  "method",
  "class",
  "interface",
  "implement",
  "implementation",
  "endpoint",
  "route",
  "handler",
  "controller",
  "module",
  "code",
];

/** Documentation-related query terms that boost documentation files */
export const DOCUMENTATION_TERMS = [
  "documentation",
  "docs",
  "guide",
  "tutorial",
  "readme",
  "how",
  "what",
  "why",
  "explain",
  "overview",
  "getting",
  "started",
  "requirements",
  "setup",
  "install",
  "configure",
  "configuration",
];

/** Source code file extensions */
export const SOURCE_CODE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
];

/** Documentation file extensions */
export const DOC_EXTENSIONS = [".md", ".txt", ".rst"];

/** Data/config file extensions */
export const DATA_EXTENSIONS = [".json", ".yaml", ".yml", ".toml"];

// ============================================================================
// Query Intent Detection
// ============================================================================

/** Query intent types */
export type QueryIntent = "implementation" | "documentation" | "neutral";

/**
 * Detect query intent based on terms.
 * Returns: 'implementation' | 'documentation' | 'neutral'
 *
 * @param queryTerms - Array of query terms (lowercase)
 * @returns The detected intent
 */
export function detectQueryIntent(queryTerms: string[]): QueryIntent {
  const hasImplementationTerm = queryTerms.some((term) =>
    IMPLEMENTATION_TERMS.includes(term)
  );
  const hasDocumentationTerm = queryTerms.some((term) =>
    DOCUMENTATION_TERMS.includes(term)
  );

  // Documentation terms take precedence if both are present
  // (e.g., "api documentation" should favor docs)
  if (hasDocumentationTerm) {
    return "documentation";
  }

  if (hasImplementationTerm) {
    return "implementation";
  }

  return "neutral";
}

/**
 * Extract query terms from a search query.
 *
 * @param query - The search query string
 * @returns Array of lowercase terms (length > 2)
 */
export function extractQueryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

// ============================================================================
// File Type Boosts
// ============================================================================

/**
 * Determine if a file is a source code file based on extension.
 */
export function isSourceCodeFile(filepath: string): boolean {
  const ext = path.extname(filepath).toLowerCase();
  return SOURCE_CODE_EXTENSIONS.includes(ext);
}

/**
 * Determine if a file is a documentation file based on extension.
 */
export function isDocFile(filepath: string): boolean {
  const ext = path.extname(filepath).toLowerCase();
  return DOC_EXTENSIONS.includes(ext);
}

/**
 * Determine if a file is a data/config file based on extension.
 */
export function isDataFile(filepath: string): boolean {
  const ext = path.extname(filepath).toLowerCase();
  return DATA_EXTENSIONS.includes(ext);
}

/**
 * Calculate boost based on file type and query context.
 * Bidirectional: boosts code for implementation queries, docs for documentation queries.
 * Only applies when query intent is clear.
 *
 * @param filepath - The file path
 * @param queryTerms - Array of query terms (lowercase)
 * @returns Boost value (0 to ~0.1)
 */
export function calculateFileTypeBoost(
  filepath: string,
  queryTerms: string[]
): number {
  const isSourceCode = isSourceCodeFile(filepath);
  const isDoc = isDocFile(filepath);

  const intent = detectQueryIntent(queryTerms);

  // For implementation-focused queries, boost source code
  if (intent === "implementation") {
    if (isSourceCode) {
      return 0.06; // Moderate boost for source code
    }
    // No penalty for docs - they might still be relevant
    return 0;
  }

  // For documentation-focused queries, boost documentation files
  if (intent === "documentation") {
    if (isDoc) {
      return 0.08; // Boost documentation files
    }
    // No penalty for code - they might still be relevant
    return 0;
  }

  // Neutral queries: no boost either way
  return 0;
}




