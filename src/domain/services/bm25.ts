/**
 * BM25 (Best Matching 25) Implementation
 * 
 * A ranking function for keyword-based search. This is a pure domain service
 * with no external dependencies - just algorithms operating on data.
 * 
 * BM25 estimates relevance of documents to a search query using term frequency
 * and inverse document frequency with length normalization.
 */

/**
 * BM25 parameters
 * - k1: Term frequency saturation (typical: 1.2-2.0)
 * - b: Length normalization (typical: 0.75)
 */
const BM25_K1 = 1.5;
const BM25_B = 0.75;

/**
 * Tokenize text into normalized terms.
 * 
 * @param text - Text to tokenize
 * @returns Array of lowercase tokens
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1);
}

/**
 * Calculate term frequency (TF) for a term in a document.
 */
function termFrequency(term: string, tokens: string[]): number {
  return tokens.filter(t => t === term).length;
}

/**
 * Document data for BM25 scoring.
 */
export interface BM25Document {
  id: string;
  content: string;
  /** Pre-computed tokens (optional, computed from content if not provided) */
  tokens?: string[];
}

/**
 * BM25 search result.
 */
export interface BM25Result {
  id: string;
  score: number;
}

/**
 * BM25 search index.
 * 
 * This is a pure in-memory data structure with no I/O operations.
 * Build the index by adding documents, then search against it.
 */
export class BM25Index {
  private documents: Map<string, { content: string; tokens: string[] }> = new Map();
  private avgDocLength: number = 0;
  private documentFrequencies: Map<string, number> = new Map();
  private totalDocs: number = 0;

  /**
   * Add documents to the index.
   * 
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
   * Calculate IDF (Inverse Document Frequency) for a term.
   */
  private idf(term: string): number {
    const docFreq = this.documentFrequencies.get(term) || 0;
    if (docFreq === 0) return 0;
    
    // Standard IDF formula with smoothing
    return Math.log(1 + (this.totalDocs - docFreq + 0.5) / (docFreq + 0.5));
  }

  /**
   * Calculate BM25 score for a document given query terms.
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
   * Search the index with a query.
   * 
   * @param query - Search query
   * @param topK - Maximum number of results to return
   * @returns Sorted array of results (highest score first)
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

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Get the number of indexed documents.
   */
  get size(): number {
    return this.totalDocs;
  }

  /**
   * Clear the index.
   */
  clear(): void {
    this.documents.clear();
    this.documentFrequencies.clear();
    this.avgDocLength = 0;
    this.totalDocs = 0;
  }

  /**
   * Add a single document by ID and pre-computed tokens.
   *
   * @param id - Document identifier
   * @param tokens - Pre-computed tokens
   */
  addDocument(id: string, tokens: string[]): void {
    this.addDocuments([{ id, content: "", tokens }]);
  }

  /**
   * Serialize the index to a JSON-compatible object.
   */
  serialize(): BM25SerializedData {
    const documents: Record<string, string[]> = {};
    for (const [id, { tokens }] of this.documents) {
      documents[id] = tokens;
    }

    return {
      documents,
      avgDocLength: this.avgDocLength,
      documentFrequencies: Object.fromEntries(this.documentFrequencies),
      totalDocs: this.totalDocs,
    };
  }

  /**
   * Deserialize a BM25 index from saved data.
   */
  static deserialize(data: BM25SerializedData): BM25Index {
    const index = new BM25Index();
    index.avgDocLength = data.avgDocLength;
    index.totalDocs = data.totalDocs;
    index.documentFrequencies = new Map(Object.entries(data.documentFrequencies));

    for (const [id, tokens] of Object.entries(data.documents)) {
      index.documents.set(id, { content: "", tokens });
    }

    return index;
  }
}

/**
 * Serialized BM25 index data.
 */
export interface BM25SerializedData {
  documents: Record<string, string[]>;
  avgDocLength: number;
  documentFrequencies: Record<string, number>;
  totalDocs: number;
}

/**
 * Normalize a raw score to 0-1 range using sigmoid function.
 * 
 * @param score - Raw score
 * @param midpoint - Score at which output is 0.5
 * @returns Normalized score between 0 and 1
 */
export function normalizeScore(score: number, midpoint: number = 5): number {
  return 1 / (1 + Math.exp(-score / midpoint + 1));
}

