/**
 * FileIndex Entity
 *
 * Represents the indexed data for a single source file.
 * This is a Tier 2 index structure containing full chunk data and embeddings.
 */

import type { Chunk } from "./chunk";

/**
 * Indexed data for a single file (Tier 2 index).
 *
 * Contains all chunks extracted from the file along with
 * module-specific data like embeddings.
 */
export interface FileIndex {
  /** Relative path to the source file */
  filepath: string;

  /** ISO timestamp of when the file was last modified */
  lastModified: string;

  /** Chunks extracted from the file */
  chunks: Chunk[];

  /** Module-specific indexed data (e.g., embeddings, symbol tables) */
  moduleData: Record<string, unknown>;

  /** References to other files (imports, requires) */
  references?: string[];
}

/**
 * Manifest entry for a single indexed file.
 */
export interface FileManifestEntry {
  /** ISO timestamp of when the file was last modified */
  lastModified: string;

  /** Number of chunks in the file */
  chunkCount: number;

  /**
   * SHA-256 hash of file content for reliable change detection.
   * This prevents false positives when git updates mtime on branch switches.
   */
  contentHash?: string;
}

/**
 * Manifest tracking all indexed files for a specific module.
 */
export interface ModuleManifest {
  /** Module identifier */
  moduleId: string;

  /** Module version (for compatibility checking) */
  version: string;

  /** ISO timestamp of last update */
  lastUpdated: string;

  /** Map of filepath to manifest entry */
  files: Record<string, FileManifestEntry>;
}

/**
 * Global manifest tracking all active modules.
 */
export interface GlobalManifest {
  /** RAGgrep version */
  version: string;

  /** ISO timestamp of last update (when index files were written) */
  lastUpdated: string;

  /**
   * ISO timestamp of when the last index run started.
   * Used to detect files modified since the last indexing pass.
   * This is captured at the START of indexing, before any files are processed.
   */
  lastIndexStarted: string;

  /** List of active module IDs */
  modules: string[];
}
