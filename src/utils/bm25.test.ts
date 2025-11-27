/**
 * Tests for BM25 search implementation
 */

import { test, expect, describe, beforeEach } from 'bun:test';
import { BM25Index, tokenize, normalizeScore } from './bm25';

describe('tokenize', () => {
  test('converts to lowercase', () => {
    const tokens = tokenize('Hello World');
    expect(tokens).toEqual(['hello', 'world']);
  });

  test('removes punctuation', () => {
    const tokens = tokenize('Hello, world! How are you?');
    expect(tokens).toEqual(['hello', 'world', 'how', 'are', 'you']);
  });

  test('filters single characters', () => {
    const tokens = tokenize('a b c hello world');
    expect(tokens).toEqual(['hello', 'world']);
  });

  test('handles code-like text', () => {
    const tokens = tokenize('function getUserById(id: string)');
    expect(tokens).toContain('function');
    expect(tokens).toContain('getuserbyid');
    expect(tokens).toContain('id');
    expect(tokens).toContain('string');
  });

  test('handles camelCase by keeping it together', () => {
    const tokens = tokenize('getUserById');
    expect(tokens).toEqual(['getuserbyid']);
  });
});

describe('BM25Index', () => {
  let index: BM25Index;

  beforeEach(() => {
    index = new BM25Index();
  });

  describe('addDocuments', () => {
    test('adds documents to the index', () => {
      index.addDocuments([
        { id: 'doc1', content: 'hello world' },
        { id: 'doc2', content: 'goodbye world' },
      ]);
      expect(index.size).toBe(2);
    });

    test('accepts pre-tokenized documents', () => {
      index.addDocuments([
        { id: 'doc1', content: 'hello world', tokens: ['hello', 'world'] },
      ]);
      expect(index.size).toBe(1);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      index.addDocuments([
        { id: 'auth', content: 'user authentication login password' },
        { id: 'session', content: 'session management token expiry' },
        { id: 'user', content: 'user profile settings preferences' },
        { id: 'database', content: 'database connection query' },
      ]);
    });

    test('returns relevant documents', () => {
      const results = index.search('user');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThan(0);
    });

    test('ranks documents with more query terms higher', () => {
      const results = index.search('user authentication');
      // 'auth' should rank highest since it has both 'user' and 'authentication'
      expect(results[0].id).toBe('auth');
    });

    test('returns empty array for non-matching query', () => {
      const results = index.search('nonexistent');
      expect(results).toEqual([]);
    });

    test('respects topK limit', () => {
      const results = index.search('user', 1);
      expect(results.length).toBe(1);
    });

    test('returns empty for empty query', () => {
      const results = index.search('');
      expect(results).toEqual([]);
    });

    test('handles query with punctuation', () => {
      const results = index.search('user!');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('scoring', () => {
    test('gives higher scores to documents with more term occurrences', () => {
      index.addDocuments([
        { id: 'single', content: 'user' },
        { id: 'multiple', content: 'user user user' },
      ]);
      
      const results = index.search('user');
      // Due to TF saturation in BM25, more occurrences should still rank higher
      const singleScore = results.find(r => r.id === 'single')?.score ?? 0;
      const multipleScore = results.find(r => r.id === 'multiple')?.score ?? 0;
      expect(multipleScore).toBeGreaterThan(singleScore);
    });

    test('uses IDF to weight rare terms higher', () => {
      index.addDocuments([
        { id: 'doc1', content: 'common rare' },
        { id: 'doc2', content: 'common common' },
        { id: 'doc3', content: 'common another' },
      ]);
      
      // 'rare' appears in 1 doc, 'common' in all 3
      // Searching for 'rare' should give high score to doc1
      const results = index.search('rare');
      expect(results[0].id).toBe('doc1');
      expect(results.length).toBe(1); // Only doc1 has 'rare'
    });
  });

  describe('clear', () => {
    test('removes all documents', () => {
      index.addDocuments([{ id: 'doc1', content: 'hello' }]);
      expect(index.size).toBe(1);
      
      index.clear();
      expect(index.size).toBe(0);
      expect(index.search('hello')).toEqual([]);
    });
  });
});

describe('normalizeScore', () => {
  test('returns 0.5 at midpoint', () => {
    const score = normalizeScore(5, 5);
    expect(score).toBeCloseTo(0.5, 1);
  });

  test('returns value between 0 and 1', () => {
    for (const rawScore of [0, 1, 5, 10, 100]) {
      const normalized = normalizeScore(rawScore);
      expect(normalized).toBeGreaterThanOrEqual(0);
      expect(normalized).toBeLessThanOrEqual(1);
    }
  });

  test('higher raw scores give higher normalized scores', () => {
    const low = normalizeScore(1);
    const mid = normalizeScore(5);
    const high = normalizeScore(10);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
  });
});

