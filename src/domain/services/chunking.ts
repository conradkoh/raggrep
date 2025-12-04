/**
 * Text Chunking Service
 *
 * Provides generic text chunking strategies for indexing.
 * These are language-agnostic and work with any text content.
 */

import type { ChunkType } from "../entities";

// ============================================================================
// Types
// ============================================================================

/**
 * Represents a chunk of text with location information.
 */
export interface TextChunk {
  /** The text content */
  content: string;
  /** 1-based start line number */
  startLine: number;
  /** 1-based end line number */
  endLine: number;
  /** The type of chunk */
  type: ChunkType;
  /** Optional name for the chunk */
  name?: string;
}

/**
 * Options for line-based chunking.
 */
export interface ChunkingOptions {
  /** Lines per chunk (default: 30) */
  chunkSize?: number;
  /** Overlap between chunks (default: 5) */
  overlap?: number;
  /** Minimum lines to create multiple chunks (default: chunkSize) */
  minLinesForMultipleChunks?: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

/** Default lines per chunk */
export const DEFAULT_CHUNK_SIZE = 30;

/** Default overlap between chunks */
export const DEFAULT_OVERLAP = 5;

// ============================================================================
// Chunking Functions
// ============================================================================

/**
 * Split text into overlapping chunks based on line boundaries.
 *
 * This is a generic chunking strategy that works with any text content.
 * It creates overlapping chunks to ensure context is preserved across
 * chunk boundaries.
 *
 * @param content - The text content to chunk
 * @param options - Chunking options
 * @returns Array of text chunks
 */
export function createLineBasedChunks(
  content: string,
  options: ChunkingOptions = {}
): TextChunk[] {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    overlap = DEFAULT_OVERLAP,
    minLinesForMultipleChunks = chunkSize,
  } = options;

  const lines = content.split("\n");
  const chunks: TextChunk[] = [];

  // If file is small, treat as single chunk
  if (lines.length <= minLinesForMultipleChunks) {
    return [
      {
        content: content,
        startLine: 1,
        endLine: lines.length,
        type: "file",
      },
    ];
  }

  // Split into overlapping chunks
  for (let i = 0; i < lines.length; i += chunkSize - overlap) {
    const endIdx = Math.min(i + chunkSize, lines.length);
    chunks.push({
      content: lines.slice(i, endIdx).join("\n"),
      startLine: i + 1,
      endLine: endIdx,
      type: "block",
    });

    if (endIdx >= lines.length) break;
  }

  return chunks;
}

/**
 * Create a single chunk from entire content.
 * Useful for small files or when chunking isn't needed.
 *
 * @param content - The text content
 * @returns A single file chunk
 */
export function createSingleChunk(content: string): TextChunk {
  const lines = content.split("\n");
  return {
    content,
    startLine: 1,
    endLine: lines.length,
    type: "file",
  };
}

/**
 * Generate a unique chunk ID from filepath and line numbers.
 *
 * @param filepath - The source file path
 * @param startLine - Start line number
 * @param endLine - End line number
 * @returns Unique chunk identifier
 */
export function generateChunkId(
  filepath: string,
  startLine: number,
  endLine: number
): string {
  const safePath = filepath.replace(/[/\\]/g, "-").replace(/\./g, "_");
  return `${safePath}-${startLine}-${endLine}`;
}

