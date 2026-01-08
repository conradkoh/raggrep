/**
 * Simple Search Service
 *
 * Provides grep-like exact text matching across files.
 * This is a pure domain service - no file I/O, just algorithms.
 *
 * Used for:
 * - Finding exact occurrences of identifiers (SCREAMING_SNAKE, camelCase)
 * - Providing a guaranteed "exact match" track separate from semantic search
 * - Context lines around matches (+/- 1 line)
 */

import type {
  ExactMatchOccurrence,
  ExactMatchFile,
  ExactMatchResults,
} from "../entities/searchResult";

/**
 * Patterns that indicate a query is a programming identifier
 * (should trigger simple search)
 */
const IDENTIFIER_PATTERNS = {
  // SCREAMING_SNAKE_CASE: AUTH_SERVICE_GRPC_URL
  screamingSnake: /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/,

  // camelCase: getServiceUrl
  camelCase: /^[a-z][a-z0-9]*(?:[A-Z][a-zA-Z0-9]*)+$/,

  // PascalCase: ServiceRegistry
  pascalCase: /^[A-Z][a-z]+(?:[A-Z][a-z0-9]*)+$/,

  // snake_case: get_service_url
  snakeCase: /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/,

  // kebab-case: get-service-url
  kebabCase: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/,
};

/**
 * Check if a query string looks like a programming identifier.
 * These queries should trigger simple search in addition to semantic search.
 *
 * @param query - The search query
 * @returns true if the query looks like an identifier
 */
export function isIdentifierQuery(query: string): boolean {
  const trimmed = query.trim();

  // Check for explicit quoting (backticks or double quotes)
  if (
    (trimmed.startsWith("`") && trimmed.endsWith("`")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return true;
  }

  // Check against identifier patterns
  for (const pattern of Object.values(IDENTIFIER_PATTERNS)) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  return false;
}

/**
 * Extract the literal to search for from a query.
 * Removes quoting if present.
 *
 * @param query - The search query
 * @returns The literal to search for
 */
export function extractSearchLiteral(query: string): string {
  const trimmed = query.trim();

  // Remove backticks
  if (trimmed.startsWith("`") && trimmed.endsWith("`")) {
    return trimmed.slice(1, -1);
  }

  // Remove double quotes
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

/**
 * Find all occurrences of a literal in file content.
 *
 * @param content - The file content to search
 * @param literal - The exact string to find
 * @param options - Search options
 * @returns Array of match occurrences with context
 */
export function findOccurrences(
  content: string,
  literal: string,
  options: {
    /** Maximum occurrences to return per file */
    maxOccurrences?: number;
    /** Whether to do case-insensitive matching */
    caseInsensitive?: boolean;
  } = {}
): ExactMatchOccurrence[] {
  const { maxOccurrences = 10, caseInsensitive = false } = options;
  const occurrences: ExactMatchOccurrence[] = [];

  const lines = content.split("\n");
  const searchContent = caseInsensitive ? content.toLowerCase() : content;
  const searchLiteral = caseInsensitive ? literal.toLowerCase() : literal;

  let currentIndex = 0;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const searchLine = caseInsensitive ? line.toLowerCase() : line;

    let columnStart = 0;

    while (true) {
      const column = searchLine.indexOf(searchLiteral, columnStart);

      if (column === -1) break;

      occurrences.push({
        line: lineNum + 1, // 1-indexed
        column,
        lineContent: line,
        contextBefore: lineNum > 0 ? lines[lineNum - 1] : undefined,
        contextAfter:
          lineNum < lines.length - 1 ? lines[lineNum + 1] : undefined,
      });

      if (occurrences.length >= maxOccurrences) {
        return occurrences;
      }

      // Move past this match to find more on the same line
      columnStart = column + 1;
    }

    currentIndex += line.length + 1; // +1 for newline
  }

  return occurrences;
}

/**
 * Search multiple files for exact matches of a literal.
 *
 * @param files - Map of filepath to content
 * @param literal - The exact string to find
 * @param options - Search options
 * @returns Exact match results
 */
export function searchFiles(
  files: Map<string, string>,
  literal: string,
  options: {
    /** Maximum files to return */
    maxFiles?: number;
    /** Maximum occurrences per file */
    maxOccurrencesPerFile?: number;
    /** Case-insensitive matching */
    caseInsensitive?: boolean;
  } = {}
): ExactMatchResults {
  const {
    maxFiles = 20,
    maxOccurrencesPerFile = 5,
    caseInsensitive = false,
  } = options;

  const matchingFiles: ExactMatchFile[] = [];
  let totalMatches = 0;
  let totalFilesWithMatches = 0;

  for (const [filepath, content] of files) {
    const occurrences = findOccurrences(content, literal, {
      maxOccurrences: maxOccurrencesPerFile,
      caseInsensitive,
    });

    if (occurrences.length > 0) {
      totalFilesWithMatches++;

      // Count actual matches (may be more than returned occurrences)
      const searchContent = caseInsensitive
        ? content.toLowerCase()
        : content;
      const searchLiteral = caseInsensitive
        ? literal.toLowerCase()
        : literal;
      let matchCount = 0;
      let index = 0;
      while ((index = searchContent.indexOf(searchLiteral, index)) !== -1) {
        matchCount++;
        index += 1;
      }

      totalMatches += matchCount;

      if (matchingFiles.length < maxFiles) {
        matchingFiles.push({
          filepath,
          occurrences,
          matchCount,
        });
      }
    }
  }

  // Sort by match count (most matches first)
  matchingFiles.sort((a, b) => b.matchCount - a.matchCount);

  return {
    query: literal,
    files: matchingFiles,
    totalMatches,
    totalFiles: totalFilesWithMatches,
    truncated: totalFilesWithMatches > maxFiles,
  };
}

/**
 * Extract all identifier-like literals from content.
 * Used during indexing to build a literal index for plain text files.
 *
 * @param content - File content to extract from
 * @returns Array of unique identifier literals found
 */
export function extractIdentifiersFromContent(content: string): string[] {
  const identifiers = new Set<string>();

  // SCREAMING_SNAKE_CASE
  const screamingMatches = content.matchAll(
    /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g
  );
  for (const match of screamingMatches) {
    identifiers.add(match[1]);
  }

  // camelCase
  const camelMatches = content.matchAll(
    /\b([a-z][a-z0-9]*(?:[A-Z][a-zA-Z0-9]*)+)\b/g
  );
  for (const match of camelMatches) {
    identifiers.add(match[1]);
  }

  // PascalCase (but not single words that are just capitalized)
  const pascalMatches = content.matchAll(
    /\b([A-Z][a-z]+(?:[A-Z][a-z0-9]*)+)\b/g
  );
  for (const match of pascalMatches) {
    identifiers.add(match[1]);
  }

  // snake_case
  const snakeMatches = content.matchAll(
    /\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g
  );
  for (const match of snakeMatches) {
    identifiers.add(match[1]);
  }

  // kebab-case (but not in URLs or file paths)
  const kebabMatches = content.matchAll(
    /(?<![/:.])\b([a-z][a-z0-9]*(?:-[a-z0-9]+)+)\b(?![/:])/g
  );
  for (const match of kebabMatches) {
    identifiers.add(match[1]);
  }

  return Array.from(identifiers);
}

/**
 * Check if a file should be included in simple search based on its content.
 * Excludes binary files and very large files.
 *
 * @param content - File content
 * @param filepath - File path for extension checking
 * @returns true if file should be searchable
 */
export function isSearchableContent(content: string, filepath: string): boolean {
  // Skip very large files (> 1MB)
  if (content.length > 1024 * 1024) {
    return false;
  }

  // Check for binary content (null bytes)
  if (content.includes("\0")) {
    return false;
  }

  // Skip common binary extensions
  const binaryExtensions = [
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp",
    ".pdf", ".zip", ".tar", ".gz", ".rar",
    ".exe", ".dll", ".so", ".dylib",
    ".woff", ".woff2", ".ttf", ".eot",
    ".mp3", ".mp4", ".wav", ".avi",
  ];
  const ext = filepath.toLowerCase().slice(filepath.lastIndexOf("."));
  if (binaryExtensions.includes(ext)) {
    return false;
  }

  return true;
}

