/**
 * Lexicon Service Tests
 *
 * Tests for query expansion using domain-specific synonyms.
 */

import { describe, it, expect } from "bun:test";
import {
  getSynonyms,
  expandQuery,
  DEFAULT_LEXICON,
  EXPANSION_WEIGHTS,
} from "./lexicon";
import type { Lexicon } from "../entities/lexicon";

describe("getSynonyms", () => {
  it("should return synonyms for known term", () => {
    const synonyms = getSynonyms("function");
    expect(synonyms.length).toBeGreaterThan(0);
    expect(synonyms.some((s) => s.term === "method")).toBe(true);
  });

  it("should return synonyms case-insensitively", () => {
    const synonyms1 = getSynonyms("Function");
    const synonyms2 = getSynonyms("FUNCTION");
    const synonyms3 = getSynonyms("function");

    expect(synonyms1).toEqual(synonyms3);
    expect(synonyms2).toEqual(synonyms3);
  });

  it("should return empty array for unknown term", () => {
    const synonyms = getSynonyms("xyznonexistent");
    expect(synonyms).toEqual([]);
  });

  it("should include grades for synonyms", () => {
    const synonyms = getSynonyms("auth");
    const strongSyn = synonyms.find((s) => s.term === "authentication");
    const weakSyn = synonyms.find((s) => s.term === "security");

    expect(strongSyn?.grade).toBe("strong");
    expect(weakSyn?.grade).toBe("weak");
  });

  it("should work with custom lexicon", () => {
    const customLexicon: Lexicon = {
      version: "1.0.0",
      entries: [
        {
          term: "custom",
          synonyms: [{ term: "special", grade: "strong" }],
        },
      ],
    };

    const synonyms = getSynonyms("custom", customLexicon);
    expect(synonyms).toEqual([{ term: "special", grade: "strong" }]);

    // Should not find default lexicon terms
    const funcSyns = getSynonyms("function", customLexicon);
    expect(funcSyns).toEqual([]);
  });
});

describe("expandQuery", () => {
  it("should expand single term with synonyms", () => {
    const result = expandQuery("function");

    expect(result.originalTerms).toEqual(["function"]);
    expect(result.wasExpanded).toBe(true);

    // Should have original term
    const original = result.expandedTerms.find(
      (t) => t.term === "function" && t.source === "original"
    );
    expect(original).toBeDefined();
    expect(original?.weight).toBe(1.0);

    // Should have synonyms
    const methodSyn = result.expandedTerms.find((t) => t.term === "method");
    expect(methodSyn).toBeDefined();
    expect(methodSyn?.source).toBe("strong");
    expect(methodSyn?.weight).toBe(EXPANSION_WEIGHTS.strong);
    expect(methodSyn?.expandedFrom).toBe("function");
  });

  it("should expand multiple terms", () => {
    const result = expandQuery("auth function");

    expect(result.originalTerms).toEqual(["auth", "function"]);
    expect(result.wasExpanded).toBe(true);

    // Should have auth synonyms
    expect(result.expandedTerms.some((t) => t.term === "authentication")).toBe(
      true
    );

    // Should have function synonyms
    expect(result.expandedTerms.some((t) => t.term === "method")).toBe(true);
  });

  it("should assign correct weights by grade", () => {
    const result = expandQuery("auth");

    const strongSyn = result.expandedTerms.find(
      (t) => t.term === "authentication"
    );
    const moderateSyn = result.expandedTerms.find((t) => t.term === "login");
    const weakSyn = result.expandedTerms.find((t) => t.term === "security");

    expect(strongSyn?.weight).toBe(0.9);
    expect(moderateSyn?.weight).toBe(0.6);
    expect(weakSyn?.weight).toBe(0.3);
  });

  it("should respect maxTerms limit", () => {
    const result = expandQuery("auth function database", DEFAULT_LEXICON, {
      maxTerms: 5,
    });

    expect(result.expandedTerms.length).toBeLessThanOrEqual(5);
  });

  it("should respect includeWeak option", () => {
    const withWeak = expandQuery("auth", DEFAULT_LEXICON, { includeWeak: true });
    const withoutWeak = expandQuery("auth", DEFAULT_LEXICON, {
      includeWeak: false,
    });

    const weakInWith = withWeak.expandedTerms.filter((t) => t.source === "weak");
    const weakInWithout = withoutWeak.expandedTerms.filter(
      (t) => t.source === "weak"
    );

    expect(weakInWith.length).toBeGreaterThan(0);
    expect(weakInWithout.length).toBe(0);
  });

  it("should respect minTermLength option", () => {
    const result = expandQuery("a db function", DEFAULT_LEXICON, {
      minTermLength: 3,
    });

    // "a" is a stop word so it's filtered out
    // "db" is too short (2 chars < 3) so it shouldn't be in expandedTerms
    // but it may still be in originalTerms from tokenization
    expect(result.originalTerms).toContain("function");

    // Short terms should not appear in expandedTerms
    const dbTerm = result.expandedTerms.find((t) => t.term === "db");
    expect(dbTerm).toBeUndefined();

    // Function should be in expandedTerms
    const funcTerm = result.expandedTerms.find((t) => t.term === "function");
    expect(funcTerm).toBeDefined();
  });

  it("should handle unknown terms gracefully", () => {
    const result = expandQuery("xyznonexistent");

    expect(result.originalTerms).toEqual(["xyznonexistent"]);
    expect(result.wasExpanded).toBe(false);
    expect(result.expandedTerms.length).toBe(1);
    expect(result.expandedTerms[0].source).toBe("original");
  });

  it("should remove stop words from query", () => {
    const result = expandQuery("find the function for authentication");

    expect(result.originalTerms).not.toContain("the");
    expect(result.originalTerms).not.toContain("for");
    expect(result.originalTerms).toContain("find");
    expect(result.originalTerms).toContain("function");
    expect(result.originalTerms).toContain("authentication");
  });

  it("should not duplicate terms", () => {
    // "function" and "method" are mutual synonyms
    const result = expandQuery("function method");

    const termCounts = new Map<string, number>();
    for (const t of result.expandedTerms) {
      const count = termCounts.get(t.term.toLowerCase()) || 0;
      termCounts.set(t.term.toLowerCase(), count + 1);
    }

    // Each term should appear only once
    for (const [term, count] of termCounts) {
      expect(count).toBe(1);
    }
  });

  it("should build correct expandedQueryString", () => {
    const result = expandQuery("auth function");

    // Should start with original terms
    expect(result.expandedQueryString.startsWith("auth function")).toBe(true);

    // Should contain some synonyms
    expect(result.expandedQueryString.length).toBeGreaterThan(
      "auth function".length
    );
  });

  it("should return empty expansion for empty query", () => {
    const result = expandQuery("");

    expect(result.originalTerms).toEqual([]);
    expect(result.expandedTerms).toEqual([]);
    expect(result.wasExpanded).toBe(false);
  });

  it("should return empty expansion for stop-words-only query", () => {
    const result = expandQuery("the a an is are");

    expect(result.originalTerms).toEqual([]);
    expect(result.expandedTerms).toEqual([]);
    expect(result.wasExpanded).toBe(false);
  });
});

describe("DEFAULT_LEXICON", () => {
  it("should have version", () => {
    expect(DEFAULT_LEXICON.version).toBe("1.0.0");
  });

  it("should have entries", () => {
    expect(DEFAULT_LEXICON.entries.length).toBeGreaterThan(0);
  });

  it("should have common programming terms", () => {
    const terms = DEFAULT_LEXICON.entries.map((e) => e.term);

    expect(terms).toContain("function");
    expect(terms).toContain("class");
    expect(terms).toContain("auth");
    expect(terms).toContain("database");
    expect(terms).toContain("api");
    expect(terms).toContain("error");
    expect(terms).toContain("config");
    expect(terms).toContain("test");
  });

  it("should have bidirectional synonyms for key terms", () => {
    // function ↔ method should work both ways
    const funcSyns = getSynonyms("function");
    const methodSyns = getSynonyms("method");

    expect(funcSyns.some((s) => s.term === "method")).toBe(true);
    expect(methodSyns.some((s) => s.term === "function")).toBe(true);
  });
});

describe("EXPANSION_WEIGHTS", () => {
  it("should have correct weights", () => {
    expect(EXPANSION_WEIGHTS.strong).toBe(0.9);
    expect(EXPANSION_WEIGHTS.moderate).toBe(0.6);
    expect(EXPANSION_WEIGHTS.weak).toBe(0.3);
  });

  it("should have decreasing weights", () => {
    expect(EXPANSION_WEIGHTS.strong).toBeGreaterThan(EXPANSION_WEIGHTS.moderate);
    expect(EXPANSION_WEIGHTS.moderate).toBeGreaterThan(EXPANSION_WEIGHTS.weak);
  });
});
