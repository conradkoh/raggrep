/**
 * JSON Path Extractor
 *
 * Extracts dot-notation key paths from JSON objects as literals.
 * Used for literal-based indexing of JSON files.
 *
 * @example
 * // user.json: { name: { first: "john" } }
 * extractJsonPaths({ name: { first: "john" } }, "user")
 * // Returns literals for: "user.name", "user.name.first"
 */

import type { ExtractedLiteral } from "../entities/literal";

/**
 * Extract all key paths from a JSON object as literals.
 * Prefixes all paths with the filename (without extension).
 *
 * @param obj - Parsed JSON object
 * @param fileBasename - Filename without extension (e.g., "user" from "user.json")
 * @returns Array of literals representing all dot-notation paths
 */
export function extractJsonPaths(
  obj: unknown,
  fileBasename: string
): ExtractedLiteral[] {
  const paths = extractPathsRecursive(obj, fileBasename);

  // Convert paths to literals
  return paths.map((path) => ({
    value: path,
    type: "identifier" as const,
    matchType: "definition" as const,
  }));
}

/**
 * Recursively extract all dot-notation paths from an object.
 *
 * @param obj - Current object/value being traversed
 * @param prefix - Current path prefix
 * @returns Array of full dot-notation paths
 */
function extractPathsRecursive(obj: unknown, prefix: string): string[] {
  const paths: string[] = [];

  if (obj === null || obj === undefined) {
    return paths;
  }

  if (Array.isArray(obj)) {
    // For arrays, add indexed paths for each element
    obj.forEach((item, index) => {
      const indexedPrefix = `${prefix}[${index}]`;
      paths.push(indexedPrefix);

      // Recurse into array elements if they are objects
      if (item !== null && typeof item === "object") {
        paths.push(...extractPathsRecursive(item, indexedPrefix));
      }
    });
  } else if (typeof obj === "object") {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const fullPath = `${prefix}.${key}`;
      paths.push(fullPath);

      // Recurse into nested objects and arrays
      if (value !== null && typeof value === "object") {
        paths.push(...extractPathsRecursive(value, fullPath));
      }
    }
  }

  return paths;
}

/**
 * Extract keywords from JSON for BM25 indexing.
 * Extracts both keys and string values.
 *
 * @param obj - Parsed JSON object
 * @returns Array of keywords for BM25 indexing
 */
export function extractJsonKeywords(obj: unknown): string[] {
  const keywords = new Set<string>();

  const extract = (value: unknown, parentKey?: string): void => {
    if (value === null || value === undefined) {
      return;
    }

    if (typeof value === "string") {
      // Split camelCase/PascalCase and add words
      const words = value
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .toLowerCase()
        .split(/[\s_\-./]+/)
        .filter((w) => w.length > 2);
      words.forEach((w) => keywords.add(w));
    } else if (Array.isArray(value)) {
      value.forEach((item) => extract(item));
    } else if (typeof value === "object") {
      for (const [key, val] of Object.entries(
        value as Record<string, unknown>
      )) {
        // Add the key as a keyword
        keywords.add(key.toLowerCase());

        // Split camelCase keys
        const keyWords = key
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .toLowerCase()
          .split(/[\s_\-]+/)
          .filter((w) => w.length > 2);
        keyWords.forEach((w) => keywords.add(w));

        extract(val, key);
      }
    }
  };

  extract(obj);
  return Array.from(keywords);
}
