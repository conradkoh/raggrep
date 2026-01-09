/**
 * Tests for chunk context preparation
 * 
 * These tests ensure that path context is properly injected into chunks
 * for all modules (markdown, typescript, etc.)
 */

import { test, expect, describe } from 'bun:test';
import { 
  prepareChunkForEmbedding, 
  extractPathKeywordsForFileSummary,
  type ChunkContextOptions 
} from './chunkContext';

describe('prepareChunkForEmbedding', () => {
  describe('path context injection', () => {
    test('includes path segments in embedding context', () => {
      const result = prepareChunkForEmbedding({
        filepath: 'guides/dynamodb/streams/overview.md',
        content: 'This is about event-driven architecture.',
      });

      // Should include path segments like 'dynamodb' and 'streams'
      expect(result).toContain('dynamodb');
      expect(result).toContain('streams');
      expect(result).toContain('This is about event-driven architecture.');
    });

    test('includes filename in context', () => {
      const result = prepareChunkForEmbedding({
        filepath: 'docs/api/authentication.md',
        content: 'Login flow documentation.',
      });

      expect(result).toContain('authentication');
      expect(result).toContain('Login flow documentation.');
    });

    test('includes heading/name when provided', () => {
      const result = prepareChunkForEmbedding({
        filepath: 'docs/guide.md',
        content: 'Step by step instructions.',
        name: 'Getting Started',
      });

      expect(result).toContain('Getting Started');
      expect(result).toContain('Step by step instructions.');
    });

    test('detects domain from path', () => {
      const result = prepareChunkForEmbedding({
        filepath: 'services/auth/userService.ts',
        content: 'export function login() {}',
      });

      // 'auth' should be detected as domain
      expect(result).toContain('auth');
    });

    test('uses relative path, not absolute', () => {
      // Simulating a path that might accidentally be absolute
      const result = prepareChunkForEmbedding({
        filepath: 'src/domain/services/auth.ts',
        content: 'export function authenticate() {}',
      });

      // Should NOT contain system path components
      expect(result).not.toContain('/Users/');
      expect(result).not.toContain('C:\\');
      expect(result).not.toContain('Documents');
    });

    test('handles deeply nested paths', () => {
      const result = prepareChunkForEmbedding({
        filepath: 'packages/backend/services/dynamodb/guides/adopt.md',
        content: 'DynamoDB streams enable...',
      });

      // Should include significant path segments
      expect(result).toContain('dynamodb');
      expect(result).toContain('guides');
    });
  });

  describe('reproduces the issue: dynamodb stream query', () => {
    test('file in dynamodb/guides/ path should include "dynamodb" in context', () => {
      // This reproduces the issue where a file at path/to/file/dynamodb/guides/adopt.md
      // didn't score well for "dynamodb stream" query because "dynamodb" from path
      // was not included in the chunk context
      const result = prepareChunkForEmbedding({
        filepath: 'path/to/file/dynamodb/guides/adopt.md',
        content: 'Line 91: Learn about streams and how to use them effectively.',
        name: 'DynamoDB Adoption Guide', // Title with "DynamoDB"
      });

      // The word "dynamodb" from the path MUST be in the embedding context
      expect(result.toLowerCase()).toContain('dynamodb');
      
      // Content should still be there
      expect(result).toContain('streams');
      
      // Title should be included
      expect(result).toContain('DynamoDB Adoption Guide');
    });

    test('path keywords are extracted for all significant segments', () => {
      const result = prepareChunkForEmbedding({
        filepath: 'infrastructure/aws/dynamodb/guides/streaming.md',
        content: 'Enable DynamoDB Streams to capture data changes.',
      });

      // All significant path segments should be included
      expect(result.toLowerCase()).toContain('dynamodb');
      expect(result.toLowerCase()).toContain('guides');
      // 'aws' might be included as domain
    });
  });

  describe('edge cases', () => {
    test('handles empty content gracefully', () => {
      const result = prepareChunkForEmbedding({
        filepath: 'docs/empty.md',
        content: '',
      });

      // Should still have path context even with empty content
      expect(result).toContain('docs');
    });

    test('handles root-level files', () => {
      const result = prepareChunkForEmbedding({
        filepath: 'README.md',
        content: 'Project documentation.',
      });

      expect(result).toContain('Project documentation.');
    });

    test('handles files with dots in path', () => {
      const result = prepareChunkForEmbedding({
        filepath: 'src/.config/settings.json',
        content: '{ "key": "value" }',
      });

      // Should handle dot-prefixed directories
      expect(result).toContain('config');
    });
  });
});

describe('extractPathKeywordsForFileSummary', () => {
  test('extracts keywords from path segments', () => {
    const keywords = extractPathKeywordsForFileSummary('services/dynamodb/streams/handler.ts');

    expect(keywords).toContain('dynamodb');
    expect(keywords).toContain('streams');
    expect(keywords).toContain('handler');
    expect(keywords).toContain('services');
  });

  test('splits camelCase in filename', () => {
    const keywords = extractPathKeywordsForFileSummary('src/userAuthService.ts');

    expect(keywords).toContain('user');
    expect(keywords).toContain('auth');
    expect(keywords).toContain('service');
  });

  test('returns deduplicated keywords', () => {
    const keywords = extractPathKeywordsForFileSummary('auth/auth/authService.ts');

    // Should not have duplicates
    const authCount = keywords.filter(k => k === 'auth').length;
    expect(authCount).toBe(1);
  });

  test('filters out common non-meaningful segments', () => {
    const keywords = extractPathKeywordsForFileSummary('src/lib/app/auth/handler.ts');

    // Should filter out generic segments like 'src', 'lib', 'app'
    expect(keywords).not.toContain('src');
    expect(keywords).not.toContain('lib');
    // But should include meaningful ones
    expect(keywords).toContain('auth');
    expect(keywords).toContain('handler');
  });
});

