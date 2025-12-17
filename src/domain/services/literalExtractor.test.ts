/**
 * Literal Extractor Tests
 *
 * Tests for vocabulary extraction and literal extraction from code chunks.
 */

import { describe, test, expect } from "bun:test";
import {
  extractVocabulary,
  extractLiterals,
  extractLiteralsWithReferences,
} from "./literalExtractor";
import {
  calculateVocabularyMatch,
  LITERAL_SCORING_CONSTANTS,
} from "./literalScorer";
import type { Chunk } from "../entities/chunk";

describe("extractVocabulary", () => {
  describe("camelCase", () => {
    test("splits camelCase identifiers", () => {
      expect(extractVocabulary("getUserById")).toEqual([
        "get",
        "user",
        "by",
        "id",
      ]);
    });

    test("handles single word camelCase", () => {
      expect(extractVocabulary("user")).toEqual(["user"]);
    });

    test("handles two-word camelCase", () => {
      expect(extractVocabulary("getUser")).toEqual(["get", "user"]);
    });
  });

  describe("PascalCase", () => {
    test("splits PascalCase identifiers", () => {
      expect(extractVocabulary("AuthService")).toEqual(["auth", "service"]);
    });

    test("handles multi-word PascalCase", () => {
      expect(extractVocabulary("UserAuthenticationService")).toEqual([
        "user",
        "authentication",
        "service",
      ]);
    });
  });

  describe("snake_case", () => {
    test("splits snake_case identifiers", () => {
      expect(extractVocabulary("get_user_by_id")).toEqual([
        "get",
        "user",
        "by",
        "id",
      ]);
    });

    test("handles two-word snake_case", () => {
      expect(extractVocabulary("user_name")).toEqual(["user", "name"]);
    });
  });

  describe("SCREAMING_SNAKE_CASE", () => {
    test("splits SCREAMING_SNAKE_CASE", () => {
      expect(extractVocabulary("MAX_RETRY_COUNT")).toEqual([
        "max",
        "retry",
        "count",
      ]);
    });

    test("handles two-word SCREAMING_SNAKE_CASE", () => {
      expect(extractVocabulary("API_KEY")).toEqual(["api", "key"]);
    });
  });

  describe("kebab-case", () => {
    test("splits kebab-case identifiers", () => {
      expect(extractVocabulary("get-user-by-id")).toEqual([
        "get",
        "user",
        "by",
        "id",
      ]);
    });

    test("handles two-word kebab-case", () => {
      expect(extractVocabulary("user-name")).toEqual(["user", "name"]);
    });
  });

  describe("mixed cases", () => {
    test("handles mixed camelCase with underscores", () => {
      // e.g., "get_UserById" → ["get", "user", "by", "id"]
      expect(extractVocabulary("get_UserById")).toEqual([
        "get",
        "user",
        "by",
        "id",
      ]);
    });

    test("handles acronyms in PascalCase", () => {
      // XMLParser should split into "xml" and "parser"
      expect(extractVocabulary("XMLParser")).toEqual(["xml", "parser"]);
    });

    test("handles acronyms in middle", () => {
      // getHTTPClient should split appropriately
      expect(extractVocabulary("getHTTPClient")).toEqual([
        "get",
        "http",
        "client",
      ]);
    });

    test("handles numbers in identifiers", () => {
      // Numbers are kept with the word, "user2FA" stays as one word
      expect(extractVocabulary("user2FA")).toEqual(["user2fa"]);
    });
  });

  describe("edge cases", () => {
    test("returns empty array for empty string", () => {
      expect(extractVocabulary("")).toEqual([]);
    });

    test("filters single character words", () => {
      expect(extractVocabulary("a")).toEqual([]);
    });

    test("deduplicates words", () => {
      // If a word appears multiple times, it should only appear once
      expect(extractVocabulary("userUser")).toEqual(["user"]);
    });

    test("handles single word", () => {
      expect(extractVocabulary("authenticate")).toEqual(["authenticate"]);
    });
  });
});

describe("extractLiterals", () => {
  test("extracts function name with vocabulary", () => {
    const chunk: Chunk = {
      id: "test-1-10",
      content: "function getUserById() {}",
      startLine: 1,
      endLine: 10,
      type: "function",
      name: "getUserById",
    };

    const literals = extractLiterals(chunk);

    expect(literals.length).toBe(1);
    expect(literals[0].value).toBe("getUserById");
    expect(literals[0].type).toBe("functionName");
    expect(literals[0].matchType).toBe("definition");
    expect(literals[0].vocabulary).toEqual(["get", "user", "by", "id"]);
  });

  test("extracts class name with vocabulary", () => {
    const chunk: Chunk = {
      id: "test-1-20",
      content: "class AuthService {}",
      startLine: 1,
      endLine: 20,
      type: "class",
      name: "AuthService",
    };

    const literals = extractLiterals(chunk);

    expect(literals.length).toBe(1);
    expect(literals[0].value).toBe("AuthService");
    expect(literals[0].type).toBe("className");
    expect(literals[0].vocabulary).toEqual(["auth", "service"]);
  });

  test("extracts interface name with vocabulary", () => {
    const chunk: Chunk = {
      id: "test-1-10",
      content: "interface UserProfile {}",
      startLine: 1,
      endLine: 10,
      type: "interface",
      name: "UserProfile",
    };

    const literals = extractLiterals(chunk);

    expect(literals.length).toBe(1);
    expect(literals[0].value).toBe("UserProfile");
    expect(literals[0].type).toBe("interfaceName");
    expect(literals[0].vocabulary).toEqual(["user", "profile"]);
  });

  test("returns empty for chunk without name", () => {
    const chunk: Chunk = {
      id: "test-1-10",
      content: "// some code",
      startLine: 1,
      endLine: 10,
      type: "block",
    };

    const literals = extractLiterals(chunk);
    expect(literals.length).toBe(0);
  });

  test("handles snake_case function names", () => {
    const chunk: Chunk = {
      id: "test-1-10",
      content: "function validate_user_input() {}",
      startLine: 1,
      endLine: 10,
      type: "function",
      name: "validate_user_input",
    };

    const literals = extractLiterals(chunk);

    expect(literals[0].vocabulary).toEqual(["validate", "user", "input"]);
  });
});

describe("extractLiteralsWithReferences", () => {
  test("extracts definition with vocabulary", () => {
    const chunk: Chunk = {
      id: "test-1-10",
      content: "class AuthService extends BaseService {}",
      startLine: 1,
      endLine: 10,
      type: "class",
      name: "AuthService",
    };

    const literals = extractLiteralsWithReferences(chunk, {
      includeTypeRefs: true,
    });

    // Should have AuthService (definition) and BaseService (reference)
    const definition = literals.find((l) => l.matchType === "definition");
    const reference = literals.find((l) => l.matchType === "reference");

    expect(definition).toBeDefined();
    expect(definition?.vocabulary).toEqual(["auth", "service"]);

    expect(reference).toBeDefined();
    expect(reference?.value).toBe("BaseService");
    expect(reference?.vocabulary).toEqual(["base", "service"]);
  });

  test("extracts imports with vocabulary", () => {
    const chunk: Chunk = {
      id: "test-1-10",
      content: `
        import { UserService, AuthValidator } from './services';
      `,
      startLine: 1,
      endLine: 10,
      type: "file",
    };

    const literals = extractLiteralsWithReferences(chunk, {
      includeImports: true,
    });

    const userService = literals.find((l) => l.value === "UserService");
    const authValidator = literals.find((l) => l.value === "AuthValidator");

    expect(userService).toBeDefined();
    expect(userService?.vocabulary).toEqual(["user", "service"]);

    expect(authValidator).toBeDefined();
    expect(authValidator?.vocabulary).toEqual(["auth", "validator"]);
  });
});

describe("calculateVocabularyMatch", () => {
  test("returns no match for empty arrays", () => {
    const result = calculateVocabularyMatch([], []);
    expect(result.isSignificant).toBe(false);
    expect(result.multiplier).toBe(1.0);
    expect(result.matchedWordCount).toBe(0);
  });

  test("detects significant vocabulary match", () => {
    // Query: "user authentication" vocabulary
    const queryVocab = ["user", "authentication"];
    // Chunk: "getUserAuth" vocabulary
    const chunkVocab = ["get", "user", "auth"];

    const result = calculateVocabularyMatch(queryVocab, chunkVocab);

    // "user" matches
    expect(result.matchedWordCount).toBe(1);
    // Only 1 word, so not significant (need 2)
    expect(result.isSignificant).toBe(false);
  });

  test("returns significant match with enough words", () => {
    const queryVocab = ["get", "user", "by", "id"];
    const chunkVocab = ["get", "user", "data"];

    const result = calculateVocabularyMatch(queryVocab, chunkVocab);

    // "get" and "user" match
    expect(result.matchedWordCount).toBe(2);
    expect(result.matchedWords).toContain("get");
    expect(result.matchedWords).toContain("user");
    expect(result.isSignificant).toBe(true);
    expect(result.multiplier).toBeGreaterThanOrEqual(
      LITERAL_SCORING_CONSTANTS.VOCABULARY.BASE_MULTIPLIER
    );
  });

  test("adds bonus for extra vocabulary words", () => {
    const queryVocab = ["fetch", "user", "profile", "data"];
    const chunkVocab = ["fetch", "user", "profile", "cache"];

    const result = calculateVocabularyMatch(queryVocab, chunkVocab);

    // 3 words match: fetch, user, profile
    expect(result.matchedWordCount).toBe(3);
    expect(result.isSignificant).toBe(true);
    // Should have bonus above base multiplier
    expect(result.multiplier).toBeGreaterThan(
      LITERAL_SCORING_CONSTANTS.VOCABULARY.BASE_MULTIPLIER
    );
  });

  test("caps vocabulary bonus at maximum", () => {
    const queryVocab = [
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "nine",
      "ten",
    ];
    const chunkVocab = [
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "nine",
      "ten",
    ];

    const result = calculateVocabularyMatch(queryVocab, chunkVocab);

    // Multiplier should be capped
    const maxPossible =
      LITERAL_SCORING_CONSTANTS.VOCABULARY.BASE_MULTIPLIER +
      LITERAL_SCORING_CONSTANTS.VOCABULARY.MAX_VOCABULARY_BONUS;
    expect(result.multiplier).toBeLessThanOrEqual(maxPossible);
  });

  test("is case-insensitive", () => {
    const queryVocab = ["User", "Auth"];
    const chunkVocab = ["user", "auth"];

    const result = calculateVocabularyMatch(queryVocab, chunkVocab);

    expect(result.matchedWordCount).toBe(2);
    expect(result.isSignificant).toBe(true);
  });
});

