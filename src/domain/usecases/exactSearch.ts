/**
 * Exact Search Use Case
 *
 * Orchestrates grep-like exact text search across source files.
 * This use case coordinates filesystem access and the simple search service.
 */

import type { FileSystem } from "../ports";
import type { ExactMatchResults } from "../entities";
import type { Config } from "../entities";
import {
  findOccurrences,
  searchFiles,
  isSearchableContent,
} from "../services/simpleSearch";

/**
 * Options for exact search operation.
 */
export interface ExactSearchOptions {
  /** Root directory to search in */
  rootDir: string;

  /** The literal string to search for */
  literal: string;

  /** Optional path filter patterns */
  pathFilter?: string[];

  /** Maximum number of files to return */
  maxFiles?: number;

  /** Maximum occurrences per file */
  maxOccurrencesPerFile?: number;

  /** Case-insensitive matching */
  caseInsensitive?: boolean;
}

/**
 * Default directories to ignore during exact search.
 */
const DEFAULT_IGNORED_DIRS = [
  "node_modules",
  ".git",
  ".raggrep",
  "dist",
  "build",
  ".next",
  "__pycache__",
  ".venv",
  "venv",
];

/**
 * Check if a file path matches any of the given filters.
 *
 * Supports two modes:
 * - Glob patterns: Contains wildcards like *, ?, etc.
 * - Path prefixes: Plain directory paths
 *
 * @param relativePath - File path relative to root
 * @param filters - Array of filters (glob patterns or path prefixes)
 * @param matchFn - Function to test glob patterns (e.g., minimatch)
 * @returns true if the path matches any filter
 */
export function matchesPathFilter(
  relativePath: string,
  filters: string[],
  matchFn: (path: string, pattern: string) => boolean
): boolean {
  const normalizedPath = relativePath.replace(/\\/g, "/");

  for (const filter of filters) {
    const normalizedFilter = filter
      .replace(/\\/g, "/")
      .replace(/^\//, "")
      .replace(/\/$/, "");

    // Check if it's a glob pattern (contains wildcards)
    const isGlobPattern = /[*?[\]{}!]/.test(normalizedFilter);

    if (isGlobPattern) {
      const pattern = normalizedFilter.startsWith("**/")
        ? normalizedFilter
        : `**/${normalizedFilter}`;

      if (matchFn(normalizedPath, pattern)) {
        return true;
      }
    } else {
      // Plain path prefix matching
      if (
        normalizedPath.startsWith(normalizedFilter + "/") ||
        normalizedPath === normalizedFilter ||
        normalizedPath.includes("/" + normalizedFilter + "/")
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Execute exact search across the codebase.
 *
 * This use case:
 * 1. Walks the filesystem to find searchable files
 * 2. Filters files based on path patterns
 * 3. Uses the simple search service to find exact matches
 * 4. Returns results sorted by match count
 *
 * @param fs - FileSystem implementation (injected dependency)
 * @param options - Search options
 * @param matchFn - Glob pattern matching function (e.g., minimatch)
 * @returns Exact match results
 */
export async function executeExactSearch(
  fs: FileSystem,
  options: ExactSearchOptions,
  matchFn: (path: string, pattern: string) => boolean
): Promise<ExactMatchResults> {
  const {
    rootDir,
    literal,
    pathFilter = [],
    maxFiles = 20,
    maxOccurrencesPerFile = 5,
    caseInsensitive = false,
  } = options;

  // Collect all searchable files
  const files = new Map<string, string>();

  /**
   * Recursively walk directory tree and collect searchable files.
   */
  async function walkDir(dir: string, baseDir: string): Promise<void> {
    try {
      const entries = await fs.readDir(dir);

      for (const entry of entries) {
        const fullPath = fs.join(dir, entry);
        const relativePath = fs.relative(baseDir, fullPath);

        // Check if it's a directory
        let isDirectory = false;
        try {
          const stats = await fs.getStats(fullPath);
          isDirectory = stats.isDirectory ?? false;
        } catch {
          continue;
        }

        if (isDirectory) {
          // Skip ignored directories
          if (DEFAULT_IGNORED_DIRS.includes(entry)) {
            continue;
          }

          await walkDir(fullPath, baseDir);
        } else {
          // Apply path filter if specified
          if (pathFilter.length > 0) {
            if (!matchesPathFilter(relativePath, pathFilter, matchFn)) {
              continue;
            }
          }

          // Read file content
          try {
            const content = await fs.readFile(fullPath);
            if (isSearchableContent(content, fullPath)) {
              files.set(relativePath, content);
            }
          } catch {
            // Skip files that can't be read
          }
        }
      }
    } catch {
      // Skip directories that can't be read
    }
  }

  await walkDir(rootDir, rootDir);

  // Perform search using domain service
  return searchFiles(files, literal, {
    maxFiles,
    maxOccurrencesPerFile,
    caseInsensitive,
  });
}
