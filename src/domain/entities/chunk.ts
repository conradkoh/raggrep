/**
 * Chunk Entity
 *
 * Represents a semantic unit of code that can be indexed and searched.
 * This is a core domain entity with no external dependencies.
 */

/**
 * Types of code chunks that can be extracted from source files.
 */
export type ChunkType =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "variable"
  | "block"
  | "file";

/**
 * A chunk of code or text that has been parsed and can be indexed.
 *
 * Chunks are the fundamental unit of indexing in RAGgrep. Each chunk
 * represents a meaningful code construct (function, class, etc.) that
 * can be independently searched and retrieved.
 */
export interface Chunk {
  /** Unique identifier for this chunk (typically filepath + line range) */
  id: string;

  /** The source code content */
  content: string;

  /** 1-based start line number in the source file */
  startLine: number;

  /** 1-based end line number in the source file */
  endLine: number;

  /** The type of code construct */
  type: ChunkType;

  /** Name of the construct (function name, class name, etc.) */
  name?: string;

  /** Whether this chunk is exported from its module */
  isExported?: boolean;

  /** JSDoc comment if present */
  jsDoc?: string;

  /** Additional metadata for extensibility */
  metadata?: Record<string, unknown>;
}

/**
 * Generate a unique chunk ID from filepath and line numbers.
 */
export function createChunkId(
  filepath: string,
  startLine: number,
  endLine: number
): string {
  const safePath = filepath.replace(/[/\\]/g, "-").replace(/\./g, "_");
  return `${safePath}-${startLine}-${endLine}`;
}
