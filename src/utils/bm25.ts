/**
 * BM25 Search Utilities
 * 
 * Re-exports BM25 functionality from the domain layer.
 * This file exists for backwards compatibility with existing code.
 * 
 * For new code, import directly from 'domain/services'.
 */

export { 
  BM25Index, 
  tokenize, 
  normalizeScore,
  type BM25Document,
  type BM25Result,
  type BM25SerializedData,
} from '../domain/services/bm25';
