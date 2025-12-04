/**
 * File Conventions Service
 *
 * Pure functions for matching files against conventions and extracting keywords.
 * No I/O operations - all functions operate on file paths.
 *
 * Categories:
 * - Entry Points: index.ts, main.ts, App.tsx, etc.
 * - Configuration: tsconfig.json, .prettierrc, package.json, etc.
 * - Frameworks: Next.js, Convex, and other framework-specific patterns
 * - Type Definitions: *.d.ts, *.types.ts
 *
 * Extensibility:
 * - Add new conventions to entryPoints.ts or configFiles.ts
 * - Add new frameworks in the frameworks/ directory
 */

import * as path from "path";
import type {
  FileConvention,
  ConventionMatch,
} from "../../entities/conventions";
import { entryPointConventions } from "./entryPoints";
import { configFileConventions } from "./configFiles";
import { getAllFrameworkConventions } from "./frameworks";

// Re-export types from entities
export type {
  FileConvention,
  ConventionCategory,
  ConventionMatch,
  FrameworkConventions,
} from "../../entities/conventions";

/**
 * Type definition file conventions (built-in).
 */
const typeDefinitionConventions: FileConvention[] = [
  {
    id: "dts-file",
    name: "TypeScript Declaration",
    description: "TypeScript type declaration file",
    category: "types",
    match: (filepath, filename) => filename.endsWith(".d.ts"),
    keywords: ["types", "declarations", "typescript", "definitions"],
  },
  {
    id: "types-file",
    name: "Types File",
    description: "TypeScript types file",
    category: "types",
    match: (filepath, filename) =>
      filename.endsWith(".types.ts") || filename === "types.ts",
    keywords: ["types", "definitions", "typescript", "interfaces"],
    dynamicKeywords: (filepath) => {
      const match = filepath.match(/([^/]+)\.types\.ts$/);
      if (match) return [match[1].toLowerCase()];
      return [];
    },
  },
  {
    id: "types-folder",
    name: "Types Folder File",
    description: "File in a types folder",
    category: "types",
    match: (filepath) =>
      filepath.includes("/types/") || filepath.startsWith("types/"),
    keywords: ["types", "definitions"],
  },
];

/**
 * Test file conventions (built-in).
 */
const testFileConventions: FileConvention[] = [
  {
    id: "test-file",
    name: "Test File",
    description: "Unit/integration test file",
    category: "test",
    match: (filepath, filename) =>
      filename.includes(".test.") ||
      filename.includes(".spec.") ||
      filename.includes("_test."),
    keywords: ["test", "spec", "unit test"],
    dynamicKeywords: (filepath) => {
      const match = filepath.match(/([^/]+)\.(test|spec)\./);
      if (match) return [match[1].toLowerCase()];
      return [];
    },
  },
  {
    id: "test-folder",
    name: "Test Folder File",
    description: "File in a test folder",
    category: "test",
    match: (filepath) =>
      filepath.includes("/__tests__/") ||
      filepath.includes("/test/") ||
      filepath.includes("/tests/") ||
      filepath.startsWith("__tests__/") ||
      filepath.startsWith("test/") ||
      filepath.startsWith("tests/"),
    keywords: ["test", "testing"],
  },
];

/**
 * Get all conventions including built-in ones.
 */
export function getConventions(): FileConvention[] {
  return [
    ...entryPointConventions,
    ...configFileConventions,
    ...getAllFrameworkConventions(),
    ...typeDefinitionConventions,
    ...testFileConventions,
  ];
}

/**
 * Match a filepath against all conventions and return keywords.
 *
 * @param filepath - The file path (relative to project root)
 * @returns Array of keywords from all matching conventions
 */
export function getConventionKeywords(filepath: string): string[] {
  const conventions = getConventions();
  const filename = path.basename(filepath);
  const extension = path.extname(filepath);
  const keywords = new Set<string>();

  for (const convention of conventions) {
    try {
      if (convention.match(filepath, filename, extension)) {
        // Add static keywords
        for (const keyword of convention.keywords) {
          keywords.add(keyword.toLowerCase());
        }

        // Add dynamic keywords
        if (convention.dynamicKeywords) {
          const dynamicKws = convention.dynamicKeywords(filepath);
          for (const kw of dynamicKws) {
            if (kw && kw.length > 1) {
              keywords.add(kw.toLowerCase());
            }
          }
        }
      }
    } catch {
      // Skip conventions that throw errors
    }
  }

  return Array.from(keywords);
}

/**
 * Match a filepath against all conventions and return detailed matches.
 *
 * @param filepath - The file path (relative to project root)
 * @returns Array of convention matches with details
 */
export function matchConventions(filepath: string): ConventionMatch[] {
  const conventions = getConventions();
  const filename = path.basename(filepath);
  const extension = path.extname(filepath);
  const matches: ConventionMatch[] = [];

  for (const convention of conventions) {
    try {
      if (convention.match(filepath, filename, extension)) {
        const keywords = [...convention.keywords];

        if (convention.dynamicKeywords) {
          const dynamicKws = convention.dynamicKeywords(filepath);
          keywords.push(...dynamicKws.filter((k) => k && k.length > 1));
        }

        matches.push({
          convention,
          keywords: keywords.map((k) => k.toLowerCase()),
        });
      }
    } catch {
      // Skip conventions that throw errors
    }
  }

  return matches;
}

// Re-export convention collections for extension
export { entryPointConventions } from "./entryPoints";
export { configFileConventions } from "./configFiles";
export { frameworkProviders, getAllFrameworkConventions } from "./frameworks";




