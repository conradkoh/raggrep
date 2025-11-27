/**
 * FileSummary Entity
 * 
 * Lightweight file summary for Tier 1 index.
 * Used for fast filtering before loading full file indexes.
 */

import type { ChunkType } from './chunk';

/**
 * Tier 1: Lightweight file summary for fast filtering.
 * 
 * Contains just enough information to decide if a file
 * is a candidate for more detailed search.
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
 * Tier 1 manifest containing all file summaries.
 */
export interface Tier1Manifest {
  /** Schema version */
  version: string;
  
  /** ISO timestamp of last update */
  lastUpdated: string;
  
  /** Module ID this manifest belongs to */
  moduleId: string;
  
  /** File summaries indexed by filepath */
  files: Record<string, FileSummary>;
  
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

