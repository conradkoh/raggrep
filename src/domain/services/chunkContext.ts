/**
 * Chunk Context Preparation Service
 * 
 * Provides a unified utility for preparing chunk content with path context
 * for embedding. This ensures consistent behavior across all indexing modules.
 * 
 * The path context helps embeddings understand the structural location of code,
 * improving search relevance for queries that reference file paths or domains.
 */

import * as path from 'path';
import { parsePathContext, formatPathContextForEmbedding, extractPathKeywords } from './keywords';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for preparing a chunk for embedding.
 */
export interface ChunkContextOptions {
  /** Relative file path (from project root) */
  filepath: string;
  
  /** The chunk content to embed */
  content: string;
  
  /** Optional name for the chunk (e.g., function name, heading) */
  name?: string;
  
  /** Optional documentation comment (e.g., JSDoc, docstring) */
  docComment?: string;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Segments that should be filtered from path context as they're too generic.
 */
const GENERIC_SEGMENTS = new Set([
  'src',
  'lib',
  'app',
  'index',
  'dist',
  'build',
  'out',
  'node_modules',
]);

/**
 * Minimum segment length to include in path context.
 */
const MIN_SEGMENT_LENGTH = 2;

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Prepare chunk content for embedding by injecting path context.
 * 
 * This function should be used by ALL indexing modules to ensure consistent
 * path context injection. The path context is prepended to the content to
 * give the embedding model awareness of the file's location in the project.
 * 
 * Format: `[domain layer segment1 segment2] [name:] [docComment] content`
 * 
 * @param options - Chunk context options
 * @returns Content string ready for embedding
 * 
 * @example
 * ```typescript
 * const embeddingContent = prepareChunkForEmbedding({
 *   filepath: 'services/dynamodb/streams/handler.ts',
 *   content: 'export function processStream() { ... }',
 *   name: 'processStream',
 * });
 * // Returns: "[dynamodb service streams] processStream: export function processStream() { ... }"
 * ```
 */
export function prepareChunkForEmbedding(options: ChunkContextOptions): string {
  const { filepath, content, name, docComment } = options;
  
  // Parse path context from relative filepath
  const pathContext = parsePathContext(filepath);
  
  // Format path context for embedding (produces something like "[domain layer segment1 segment2]")
  const pathPrefix = formatPathContextForEmbedding(pathContext);
  
  // Build the embedding content
  const parts: string[] = [];
  
  // 1. Add path context prefix
  if (pathPrefix) {
    parts.push(pathPrefix);
  }
  
  // 2. Add filename (without extension) for additional context
  const filename = path.basename(filepath);
  const filenameWithoutExt = filename.replace(/\.[^.]+$/, '');
  if (filenameWithoutExt && filenameWithoutExt.length > MIN_SEGMENT_LENGTH) {
    // Don't duplicate if filename is already in path prefix
    const pathPrefixLower = pathPrefix.toLowerCase();
    if (!pathPrefixLower.includes(filenameWithoutExt.toLowerCase())) {
      parts.push(filenameWithoutExt);
    }
  }
  
  // 3. Add name/heading prefix if provided
  if (name) {
    parts.push(`${name}:`);
  }
  
  // 4. Add doc comment if provided
  if (docComment) {
    parts.push(docComment);
  }
  
  // 5. Add the actual content
  parts.push(content);
  
  return parts.join(' ');
}

/**
 * Extract path keywords for inclusion in FileSummary.
 * 
 * This provides a deduplicated list of keywords extracted from the file path,
 * suitable for BM25 and other keyword-based search mechanisms.
 * 
 * @param filepath - Relative file path
 * @returns Array of deduplicated lowercase keywords
 * 
 * @example
 * ```typescript
 * const keywords = extractPathKeywordsForFileSummary('services/dynamodb/streams/handler.ts');
 * // Returns: ['services', 'dynamodb', 'streams', 'handler']
 * ```
 */
export function extractPathKeywordsForFileSummary(filepath: string): string[] {
  // Use the existing extractPathKeywords function
  const keywords = extractPathKeywords(filepath);
  
  // Filter out generic segments that don't add search value
  const filtered = keywords.filter(k => 
    k.length >= MIN_SEGMENT_LENGTH && !GENERIC_SEGMENTS.has(k)
  );
  
  // Deduplicate and return
  return [...new Set(filtered)];
}

/**
 * Get path context data for inclusion in FileSummary.
 * 
 * This returns the parsed path context that can be stored in FileSummary
 * for later use during search scoring.
 * 
 * @param filepath - Relative file path
 * @returns Path context object
 */
export function getPathContextForFileSummary(filepath: string): {
  segments: string[];
  layer?: string;
  domain?: string;
  depth: number;
} {
  const pathContext = parsePathContext(filepath);
  return {
    segments: pathContext.segments,
    layer: pathContext.layer,
    domain: pathContext.domain,
    depth: pathContext.depth,
  };
}

