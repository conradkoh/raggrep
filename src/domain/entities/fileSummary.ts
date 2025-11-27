/**
 * FileSummary Entity
 *
 * Lightweight file summary for the symbolic index.
 * Used for fast keyword-based filtering before loading full file indexes.
 *
 * Stored as individual files in: .raggrep/index/<module>/symbolic/<filepath>.json
 */

import type { ChunkType } from "./chunk";

/**
 * Lightweight file summary for fast filtering.
 *
 * Contains just enough information to decide if a file
 * is a candidate for more detailed semantic search.
 */
export interface FileSummary {
  /** Relative path to the source file */
  filepath: string;

  /** Number of chunks in this file */
  chunkCount: number;

  /** Types of chunks present (function, class, interface, etc.) */
  chunkTypes: ChunkType[];

  /** Extracted keywords from chunk names and content */
  keywords: string[];

  /** Names of exported symbols */
  exports: string[];

  /** ISO timestamp of when the file was last modified */
  lastModified: string;
}

/**
 * Metadata for the symbolic index.
 * Stored in: .raggrep/index/<module>/symbolic/_meta.json
 *
 * Contains global BM25 statistics needed for keyword search.
 * Individual FileSummary files are stored separately for scalability.
 */
export interface SymbolicIndexMeta {
  /** Schema version */
  version: string;

  /** ISO timestamp of last update */
  lastUpdated: string;

  /** Module ID this index belongs to */
  moduleId: string;

  /** Number of indexed files */
  fileCount: number;

  /** Pre-computed BM25 data for keyword search */
  bm25Data: {
    /** Average document length */
    avgDocLength: number;
    /** Document frequencies for each term */
    documentFrequencies: Record<string, number>;
    /** Total number of documents */
    totalDocs: number;
  };
}

/**
 * @deprecated Use SymbolicIndexMeta instead. Kept for backwards compatibility.
 */
export type Tier1Manifest = SymbolicIndexMeta & {
  files: Record<string, FileSummary>;
};
