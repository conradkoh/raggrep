/**
 * Convention Types
 *
 * Defines patterns for recognizing special files and their semantic meaning.
 * Used by the conventions service to add semantic keywords to the search index.
 */

/**
 * Categories for organizing conventions.
 */
export type ConventionCategory =
  | "entry-point"
  | "configuration"
  | "framework"
  | "types"
  | "test"
  | "documentation"
  | "build"
  | "deployment";

/**
 * A file convention pattern that matches files and provides keywords.
 */
export interface FileConvention {
  /** Unique identifier for this convention */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this convention represents */
  description: string;

  /** Category for grouping conventions */
  category: ConventionCategory;

  /**
   * Match function - returns true if the filepath matches this convention.
   * @param filepath - The file path (relative to project root)
   * @param filename - Just the filename
   * @param extension - File extension including dot (e.g., ".ts")
   */
  match: (filepath: string, filename: string, extension: string) => boolean;

  /**
   * Keywords to add when this convention matches.
   * These will be added to the search index.
   */
  keywords: string[];

  /**
   * Optional: Additional keywords based on the filepath.
   * Useful for extracting context from the path.
   */
  dynamicKeywords?: (filepath: string) => string[];
}

/**
 * A framework convention provider.
 * Frameworks can register their own conventions.
 */
export interface FrameworkConventions {
  /** Framework identifier */
  id: string;

  /** Framework name */
  name: string;

  /** Check if this framework is detected in the project */
  detect: (filepath: string, allFiles?: string[]) => boolean;

  /** Conventions specific to this framework */
  conventions: FileConvention[];
}

/**
 * Result of matching conventions against a file.
 */
export interface ConventionMatch {
  /** The convention that matched */
  convention: FileConvention;

  /** Keywords from this match */
  keywords: string[];
}




