/**
 * Similarity Service
 *
 * Pure mathematical functions for computing vector similarity.
 * No external dependencies.
 */

/**
 * Calculate cosine similarity between two vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Similarity score between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite)
 * @throws Error if vectors have different lengths
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Calculate Euclidean distance between two vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Distance (0 = identical, larger = more different)
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

