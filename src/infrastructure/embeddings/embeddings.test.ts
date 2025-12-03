/**
 * Tests for embedding utilities
 */

import { test, expect, describe } from "bun:test";
import { cosineSimilarity } from "../../domain/services/similarity";
import { EMBEDDING_MODELS, getCacheDir } from "./transformersEmbedding";

describe("cosineSimilarity", () => {
  test("returns 1 for identical vectors", () => {
    const vector = [1, 2, 3, 4, 5];
    const similarity = cosineSimilarity(vector, vector);
    expect(similarity).toBeCloseTo(1, 5);
  });

  test("returns 0 for orthogonal vectors", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(0, 5);
  });

  test("returns -1 for opposite vectors", () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(-1, 5);
  });

  test("handles normalized vectors correctly", () => {
    // Two normalized vectors at 45 degrees
    const a = [1, 0];
    const b = [Math.SQRT1_2, Math.SQRT1_2]; // cos(45°), sin(45°)
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(Math.SQRT1_2, 5); // cos(45°) ≈ 0.707
  });

  test("is commutative (a·b = b·a)", () => {
    const a = [1, 2, 3, 4];
    const b = [5, 6, 7, 8];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });

  test("returns 0 for zero vectors", () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBe(0);
  });

  test("handles high-dimensional vectors (384 dims)", () => {
    // Simulate embedding vectors
    const a = Array(384)
      .fill(0)
      .map((_, i) => Math.sin(i));
    const b = Array(384)
      .fill(0)
      .map((_, i) => Math.cos(i));
    const similarity = cosineSimilarity(a, b);

    // Just verify it returns a valid number between -1 and 1
    expect(similarity).toBeGreaterThanOrEqual(-1);
    expect(similarity).toBeLessThanOrEqual(1);
  });

  test("throws for vectors of different lengths", () => {
    const a = [1, 2, 3];
    const b = [1, 2];
    expect(() => cosineSimilarity(a, b)).toThrow("Vector length mismatch");
  });

  test("handles very small values", () => {
    const a = [1e-10, 2e-10, 3e-10];
    const b = [1e-10, 2e-10, 3e-10];
    const similarity = cosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(1, 5);
  });

  test("handles mixed positive and negative values", () => {
    const a = [1, -2, 3, -4];
    const b = [2, 1, -1, 2];
    const similarity = cosineSimilarity(a, b);

    // Manual calculation: dot = 2 - 2 - 3 - 8 = -11
    // |a| = sqrt(1+4+9+16) = sqrt(30)
    // |b| = sqrt(4+1+1+4) = sqrt(10)
    // cos = -11 / sqrt(300) ≈ -0.635
    expect(similarity).toBeCloseTo(-11 / Math.sqrt(300), 5);
  });
});

describe("EMBEDDING_MODELS", () => {
  test("contains expected models", () => {
    const modelNames = Object.keys(EMBEDDING_MODELS);
    expect(modelNames).toContain("all-MiniLM-L6-v2");
    expect(modelNames).toContain("all-MiniLM-L12-v2");
    expect(modelNames).toContain("bge-small-en-v1.5");
    expect(modelNames).toContain("paraphrase-MiniLM-L3-v2");
    expect(modelNames).toContain("nomic-embed-text-v1.5");
  });

  test("model IDs are valid Hugging Face model paths", () => {
    for (const modelId of Object.values(EMBEDDING_MODELS)) {
      // Should be in format "org/model-name"
      expect(modelId).toMatch(/^[\w-]+\/[\w.-]+$/);
    }
  });
});

describe("getCacheDir", () => {
  test("returns a valid path", () => {
    const cacheDir = getCacheDir();
    expect(cacheDir).toContain(".cache");
    expect(cacheDir).toContain("raggrep");
    expect(cacheDir).toContain("models");
  });
});
