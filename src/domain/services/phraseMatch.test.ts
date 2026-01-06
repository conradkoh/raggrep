/**
 * Tests for Phrase Matching Service
 */

import { describe, test, expect } from "bun:test";
import {
  calculatePhraseMatch,
  hasExactPhrase,
  calculateTokenCoverage,
  tokenizeForMatching,
  PHRASE_MATCH_CONSTANTS,
} from "./phraseMatch";

describe("tokenizeForMatching", () => {
  test("splits text into lowercase tokens", () => {
    const tokens = tokenizeForMatching("Hello World Test", false);
    expect(tokens).toEqual(["hello", "world", "test"]);
  });

  test("removes punctuation", () => {
    const tokens = tokenizeForMatching("hello, world! test.", false);
    expect(tokens).toEqual(["hello", "world", "test"]);
  });

  test("filters stop words by default", () => {
    const tokens = tokenizeForMatching("the quick brown fox");
    expect(tokens).toEqual(["quick", "brown", "fox"]);
  });

  test("keeps stop words when filterStopWords is false", () => {
    const tokens = tokenizeForMatching("the quick brown fox", false);
    expect(tokens).toEqual(["the", "quick", "brown", "fox"]);
  });

  test("filters single-character tokens", () => {
    const tokens = tokenizeForMatching("a b c hello", false);
    expect(tokens).toEqual(["hello"]);
  });

  test("returns empty array for empty input", () => {
    expect(tokenizeForMatching("")).toEqual([]);
    expect(tokenizeForMatching("   ")).toEqual([]);
  });
});

describe("hasExactPhrase", () => {
  test("returns true when exact phrase is found", () => {
    const content = "This explains the authentication flow for new users";
    expect(hasExactPhrase(content, "authentication flow")).toBe(true);
  });

  test("returns true for case-insensitive match", () => {
    const content = "This explains the Authentication Flow for new users";
    expect(hasExactPhrase(content, "authentication flow")).toBe(true);
  });

  test("returns false when phrase is not found", () => {
    const content = "This is about user registration";
    expect(hasExactPhrase(content, "authentication flow")).toBe(false);
  });

  test("returns false for empty inputs", () => {
    expect(hasExactPhrase("", "test")).toBe(false);
    expect(hasExactPhrase("content", "")).toBe(false);
    expect(hasExactPhrase("content", "ab")).toBe(false); // Too short
  });
});

describe("calculateTokenCoverage", () => {
  test("returns 1.0 for full token coverage", () => {
    const content = "This has user authentication and session handling";
    const coverage = calculateTokenCoverage(content, "user authentication session");
    expect(coverage).toBe(1.0);
  });

  test("returns partial coverage", () => {
    const content = "This has user authentication only";
    const coverage = calculateTokenCoverage(content, "user authentication session");
    // "user" and "authentication" found, "session" not found = 2/3
    expect(coverage).toBeCloseTo(0.666, 2);
  });

  test("returns 0 for no token coverage", () => {
    const content = "This is about something else entirely";
    const coverage = calculateTokenCoverage(content, "authentication session");
    expect(coverage).toBe(0);
  });

  test("filters stop words from query", () => {
    const content = "user authentication";
    // "the" and "for" are stop words, so only "user" and "authentication" count
    const coverage = calculateTokenCoverage(content, "the user authentication for");
    expect(coverage).toBe(1.0);
  });
});

describe("calculatePhraseMatch", () => {
  describe("exact phrase matching", () => {
    test("detects exact phrase and returns high boost", () => {
      const content = "This explains the authentication flow for new users";
      const result = calculatePhraseMatch(content, "authentication flow for new users");

      expect(result.exactMatch).toBe(true);
      expect(result.boost).toBe(PHRASE_MATCH_CONSTANTS.EXACT_PHRASE_BOOST);
      expect(result.isSignificant).toBe(true);
    });

    test("exact match is case insensitive", () => {
      const content = "The Authentication Flow For New Users";
      const result = calculatePhraseMatch(content, "authentication flow for new users");

      expect(result.exactMatch).toBe(true);
    });

    test("partial phrase is not exact match", () => {
      const content = "This has authentication and flow separately";
      const result = calculatePhraseMatch(content, "authentication flow");

      expect(result.exactMatch).toBe(false);
    });
  });

  describe("token coverage", () => {
    test("calculates full coverage correctly", () => {
      const content = "user session validation logic";
      const result = calculatePhraseMatch(content, "user session validation");

      expect(result.coverage).toBe(1.0);
      expect(result.matchedTokenCount).toBe(3);
      expect(result.totalTokenCount).toBe(3);
    });

    test("calculates partial coverage correctly", () => {
      const content = "user authentication service";
      const result = calculatePhraseMatch(content, "user session validation");

      expect(result.matchedTokenCount).toBe(1); // Only "user" matches
      expect(result.totalTokenCount).toBe(3);
      expect(result.coverage).toBeCloseTo(0.333, 2);
    });

    test("high coverage without exact match gets medium boost", () => {
      const content = "This code handles user session and validation logic";
      const result = calculatePhraseMatch(content, "user session validation");

      expect(result.exactMatch).toBe(false);
      expect(result.coverage).toBe(1.0); // All tokens found
      expect(result.boost).toBe(PHRASE_MATCH_CONSTANTS.HIGH_COVERAGE_BOOST);
      expect(result.isSignificant).toBe(true);
    });

    test("medium coverage gets smaller boost", () => {
      const content = "This handles user authentication";
      // Tokens: "user", "session", "validation" -> only "user" found = 1/3 = 33%
      const result = calculatePhraseMatch(content, "user session validation");

      expect(result.coverage).toBeCloseTo(0.333, 2);
      expect(result.boost).toBe(0); // Below medium threshold
      expect(result.isSignificant).toBe(false);
    });
  });

  describe("edge cases", () => {
    test("returns zero for empty content", () => {
      const result = calculatePhraseMatch("", "test query");

      expect(result.exactMatch).toBe(false);
      expect(result.coverage).toBe(0);
      expect(result.boost).toBe(0);
    });

    test("returns zero for empty query", () => {
      const result = calculatePhraseMatch("some content", "");

      expect(result.exactMatch).toBe(false);
      expect(result.coverage).toBe(0);
      expect(result.boost).toBe(0);
    });

    test("returns zero for very short query", () => {
      const result = calculatePhraseMatch("some content", "ab");

      expect(result.exactMatch).toBe(false);
      expect(result.boost).toBe(0);
    });

    test("handles queries with only stop words", () => {
      const result = calculatePhraseMatch("the quick brown fox", "the a an");

      // After filtering stop words, no meaningful tokens remain
      expect(result.totalTokenCount).toBe(0);
      expect(result.coverage).toBe(0);
    });
  });

  describe("real-world examples", () => {
    test("documentation search: finds exact prose match", () => {
      const content = `
# Authentication Guide

This document explains the authentication flow for new users.
When a user first registers, they need to verify their email.
      `;
      const result = calculatePhraseMatch(
        content,
        "authentication flow for new users"
      );

      expect(result.exactMatch).toBe(true);
      expect(result.boost).toBe(PHRASE_MATCH_CONSTANTS.EXACT_PHRASE_BOOST);
    });

    test("code search: finds tokens in function content", () => {
      const content = `
export function validateUserSession(sessionId: string): boolean {
  // Check if user session is still valid
  return checkSessionExpiry(sessionId);
}
      `;
      const result = calculatePhraseMatch(
        content,
        "validate user session"
      );

      // "validate", "user", "session" all appear (as validateUserSession and in content)
      expect(result.coverage).toBe(1.0);
      expect(result.isSignificant).toBe(true);
    });

    test("markdown heading search", () => {
      const content = "## Database Connection Pool Configuration";
      const result = calculatePhraseMatch(
        content,
        "database connection pool"
      );

      expect(result.exactMatch).toBe(true);
      expect(result.boost).toBe(PHRASE_MATCH_CONSTANTS.EXACT_PHRASE_BOOST);
    });
  });
});

