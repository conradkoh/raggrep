/**
 * Vocabulary Matching Tests
 *
 * Tests for vocabulary extraction and matching capabilities.
 * These tests verify that:
 * - Vocabulary is correctly extracted from symbol names
 * - Partial vocabulary matches work in search
 * - Scoring tiers are applied correctly
 */

import { describe, test, expect } from "bun:test";
import { extractVocabulary } from "../domain/services/literalExtractor";
import { calculateVocabularyMatch } from "../domain/services/literalScorer";

describe("Vocabulary Extraction", () => {
  describe("camelCase", () => {
    test("should split simple camelCase", () => {
      expect(extractVocabulary("getUserById")).toEqual(["get", "user", "by", "id"]);
    });

    test("should handle single word", () => {
      expect(extractVocabulary("user")).toEqual(["user"]);
    });

    test("should handle leading lowercase followed by caps", () => {
      expect(extractVocabulary("parseJSON")).toEqual(["parse", "json"]);
    });
  });

  describe("PascalCase", () => {
    test("should split PascalCase", () => {
      expect(extractVocabulary("AuthService")).toEqual(["auth", "service"]);
    });

    test("should handle consecutive capitals", () => {
      expect(extractVocabulary("XMLParser")).toEqual(["xml", "parser"]);
    });

    test("should handle single capital words", () => {
      expect(extractVocabulary("URL")).toEqual(["url"]);
    });
  });

  describe("snake_case", () => {
    test("should split snake_case", () => {
      expect(extractVocabulary("get_user_by_id")).toEqual(["get", "user", "by", "id"]);
    });

    test("should handle SCREAMING_SNAKE_CASE", () => {
      expect(extractVocabulary("MAX_RETRY_COUNT")).toEqual(["max", "retry", "count"]);
    });
  });

  describe("kebab-case", () => {
    test("should split kebab-case", () => {
      expect(extractVocabulary("get-user-by-id")).toEqual(["get", "user", "by", "id"]);
    });
  });

  describe("mixed cases", () => {
    test("should handle mixed conventions", () => {
      const vocab = extractVocabulary("UserService_getInstance");
      expect(vocab).toContain("user");
      expect(vocab).toContain("service");
      expect(vocab).toContain("get");
      expect(vocab).toContain("instance");
    });
  });
});

describe("Vocabulary Matching", () => {
  describe("calculateVocabularyMatch", () => {
    test("should return perfect match for identical vocabulary", () => {
      const result = calculateVocabularyMatch(
        ["get", "user"],
        ["get", "user"]
      );
      expect(result.matchedWordCount).toBe(2);
      expect(result.matchedWords).toEqual(["get", "user"]);
      expect(result.isSignificant).toBe(true);
      expect(result.multiplier).toBeGreaterThan(1.0);
    });

    test("should return partial match for subset", () => {
      const result = calculateVocabularyMatch(
        ["get", "user"],
        ["get", "user", "by", "id"]
      );
      // Matches "get" and "user" from the literal vocabulary
      expect(result.matchedWordCount).toBe(2);
      expect(result.matchedWords.sort()).toEqual(["get", "user"]);
    });

    test("should return zero matches for no overlap", () => {
      const result = calculateVocabularyMatch(
        ["create", "account"],
        ["get", "user", "by", "id"]
      );
      expect(result.matchedWordCount).toBe(0);
      expect(result.matchedWords.length).toBe(0);
      expect(result.multiplier).toBe(1.0);
    });

    test("should be case-insensitive", () => {
      const result = calculateVocabularyMatch(
        ["GET", "USER"],
        ["get", "user"]
      );
      expect(result.matchedWordCount).toBe(2);
    });

    test("should handle empty query vocabulary", () => {
      const result = calculateVocabularyMatch(
        [],
        ["get", "user"]
      );
      expect(result.matchedWordCount).toBe(0);
      expect(result.multiplier).toBe(1.0);
    });

    test("should handle empty literal vocabulary", () => {
      const result = calculateVocabularyMatch(
        ["get", "user"],
        []
      );
      expect(result.matchedWordCount).toBe(0);
      expect(result.multiplier).toBe(1.0);
    });
  });
});

describe("Vocabulary Search Scenarios", () => {
  describe("Common search patterns", () => {
    test("single word query against compound name", () => {
      // User searching for "user" should match "getUserById"
      const queryVocab = ["user"];
      const literalVocab = ["get", "user", "by", "id"];
      
      const result = calculateVocabularyMatch(queryVocab, literalVocab);
      
      // Should find a match
      expect(result.matchedWordCount).toBe(1);
      expect(result.matchedWords).toContain("user");
    });

    test("multi-word query with partial match", () => {
      // User searching for "get user" should match "getUserById"
      const queryVocab = ["get", "user"];
      const literalVocab = ["get", "user", "by", "id"];
      
      const result = calculateVocabularyMatch(queryVocab, literalVocab);
      
      // Should find 2 matches
      expect(result.matchedWordCount).toBe(2);
      expect(result.isSignificant).toBe(true);
    });

    test("synonym-like query", () => {
      // "fetch data" vs "getData" - only "data" matches
      const queryVocab = ["fetch", "data"];
      const literalVocab = ["get", "data"];
      
      const result = calculateVocabularyMatch(queryVocab, literalVocab);
      
      // "data" matches
      expect(result.matchedWords).toContain("data");
      expect(result.matchedWordCount).toBe(1);
    });

    test("service lookup", () => {
      // Searching for "auth" should match "AuthService"
      const queryVocab = ["auth"];
      const literalVocab = ["auth", "service"];
      
      const result = calculateVocabularyMatch(queryVocab, literalVocab);
      
      expect(result.matchedWords).toContain("auth");
      expect(result.matchedWordCount).toBe(1);
    });

    test("significant match should boost score", () => {
      // Significant matches (2+ words) should have multiplier > 1
      const queryVocab = ["get", "user", "by"];
      const literalVocab = ["get", "user", "by", "id"];
      
      const result = calculateVocabularyMatch(queryVocab, literalVocab);
      
      expect(result.matchedWordCount).toBe(3);
      expect(result.isSignificant).toBe(true);
      expect(result.multiplier).toBeGreaterThan(1.0);
    });
  });
});
