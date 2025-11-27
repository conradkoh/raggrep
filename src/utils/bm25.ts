/**
 * BM25 (Best Matching 25) implementation for keyword-based search
 * 
 * BM25 is a ranking function used to estimate the relevance of documents
 * to a given search query. It's used as a fallback when semantic search
 * doesn't find good matches.
 */

/**
 * BM25 parameters
 * - k1: Term frequency saturation parameter (typical: 1.2-2.0)
 * - b: Length normalization parameter (typical: 0.75)
 */
const BM25_K1 = 1.5;
const BM25_B = 0.75;

/**
 * Tokenize text into normalized terms
 * @param text - Text to tokenize
 * @returns Array of lowercase tokens
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
    .split(/\s+/)
    .filter(token => token.length > 1); // Filter single characters
}

/**
 * Calculate term frequency (TF) for a term in a document
 * @param term - Search term
 * @param tokens - Document tokens
 * @returns Term frequency
 */
function termFrequency(term: string, tokens: string[]): number {
  return tokens.filter(t => t === term).length;
}

/**
 * Document data for BM25 scoring
 */
export interface BM25Document {
  id: string;
  content: string;
  tokens?: string[];
}

/**
 * BM25 search result
 */
export interface BM25Result {
  id: string;
  score: number;
}

/**
 * BM25 search index
 */
export class BM25Index {
  private documents: Map<string, { content: string; tokens: string[] }> = new Map();
  private avgDocLength: number = 0;
  private documentFrequencies: Map<string, number> = new Map();
  private totalDocs: number = 0;

  /**
   * Add documents to the index
   * @param documents - Array of documents to index
   */
  addDocuments(documents: BM25Document[]): void {
    let totalLength = this.avgDocLength * this.totalDocs;

    for (const doc of documents) {
      const tokens = doc.tokens ?? tokenize(doc.content);
      this.documents.set(doc.id, { content: doc.content, tokens });
      totalLength += tokens.length;
      this.totalDocs++;

      // Update document frequencies
      const uniqueTerms = new Set(tokens);
      for (const term of uniqueTerms) {
        const count = this.documentFrequencies.get(term) || 0;
        this.documentFrequencies.set(term, count + 1);
      }
    }

    this.avgDocLength = this.totalDocs > 0 ? totalLength / this.totalDocs : 0;
  }

  /**
   * Calculate IDF (Inverse Document Frequency) for a term
   * @param term - Search term
   * @returns IDF score
   */
  private idf(term: string): number {
    const docFreq = this.documentFrequencies.get(term) || 0;
    if (docFreq === 0) return 0;
    
    // Standard IDF formula with smoothing
    return Math.log(1 + (this.totalDocs - docFreq + 0.5) / (docFreq + 0.5));
  }

  /**
   * Calculate BM25 score for a document given query terms
   * @param tokens - Document tokens
   * @param queryTerms - Query terms
   * @returns BM25 score
   */
  private score(tokens: string[], queryTerms: string[]): number {
    const docLength = tokens.length;
    let score = 0;

    for (const term of queryTerms) {
      const tf = termFrequency(term, tokens);
      if (tf === 0) continue;

      const idfScore = this.idf(term);
      
      // BM25 formula
      const numerator = tf * (BM25_K1 + 1);
      const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * (docLength / this.avgDocLength));
      
      score += idfScore * (numerator / denominator);
    }

    return score;
  }

  /**
   * Search the index with a query
   * @param query - Search query
   * @param topK - Maximum number of results to return
   * @returns Sorted array of results
   */
  search(query: string, topK: number = 10): BM25Result[] {
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) return [];

    const results: BM25Result[] = [];

    for (const [id, { tokens }] of this.documents) {
      const score = this.score(tokens, queryTerms);
      if (score > 0) {
        results.push({ id, score });
      }
    }

    // Sort by score descending and return top K
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Get the number of indexed documents
   */
  get size(): number {
    return this.totalDocs;
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.documents.clear();
    this.documentFrequencies.clear();
    this.avgDocLength = 0;
    this.totalDocs = 0;
  }
}

/**
 * Normalize a score to 0-1 range using sigmoid function
 * @param score - Raw score
 * @param midpoint - Score at which output is 0.5
 * @returns Normalized score between 0 and 1
 */
export function normalizeScore(score: number, midpoint: number = 5): number {
  return 1 / (1 + Math.exp(-score / midpoint + 1));
}


