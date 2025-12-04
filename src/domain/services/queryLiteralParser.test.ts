/**
 * QueryLiteralParser Tests
 *
 * Comprehensive tests for query literal detection.
 * Tests explicit (backticks, quotes) and implicit (casing patterns) detection.
 */

import { describe, it, expect } from "bun:test";
import { parseQueryLiterals } from "./queryLiteralParser";

describe("parseQueryLiterals", () => {
  describe("explicit detection - backticks", () => {
    it("should detect a single backtick-wrapped literal", () => {
      const result = parseQueryLiterals("find the `AuthService` class");

      expect(result.literals).toHaveLength(1);
      expect(result.literals[0]).toMatchObject({
        value: "AuthService",
        rawValue: "`AuthService`",
        confidence: "high",
        detectionMethod: "explicit-backtick",
      });
      expect(result.remainingQuery).toBe("find the  class");
    });

    it("should detect multiple backtick-wrapped literals", () => {
      const result = parseQueryLiterals("`UserService` uses `AuthService`");

      expect(result.literals).toHaveLength(2);
      expect(result.literals[0].value).toBe("UserService");
      expect(result.literals[1].value).toBe("AuthService");
      expect(result.literals.every((l) => l.confidence === "high")).toBe(true);
    });

    it("should handle backticks at start and end of query", () => {
      const result = parseQueryLiterals("`AuthService`");

      expect(result.literals).toHaveLength(1);
      expect(result.literals[0].value).toBe("AuthService");
      expect(result.remainingQuery.trim()).toBe("");
    });

    it("should handle empty backticks gracefully", () => {
      const result = parseQueryLiterals("find `` something");

      // Empty backticks should not produce a literal
      expect(result.literals).toHaveLength(0);
    });

    it("should handle backticks with spaces inside", () => {
      const result = parseQueryLiterals("find `auth service` here");

      expect(result.literals).toHaveLength(1);
      expect(result.literals[0].value).toBe("auth service");
    });
  });

  describe("explicit detection - quotes", () => {
    it("should detect a single quoted literal", () => {
      const result = parseQueryLiterals('search for "handleLogin"');

      expect(result.literals).toHaveLength(1);
      expect(result.literals[0]).toMatchObject({
        value: "handleLogin",
        rawValue: '"handleLogin"',
        confidence: "high",
        detectionMethod: "explicit-quote",
      });
    });

    it("should detect multiple quoted literals", () => {
      const result = parseQueryLiterals('"UserService" and "AuthService"');

      expect(result.literals).toHaveLength(2);
      expect(result.literals[0].value).toBe("UserService");
      expect(result.literals[1].value).toBe("AuthService");
    });

    it("should handle mixed backticks and quotes", () => {
      const result = parseQueryLiterals('`AuthService` uses "handleLogin"');

      expect(result.literals).toHaveLength(2);
      expect(result.literals[0]).toMatchObject({
        value: "AuthService",
        detectionMethod: "explicit-backtick",
      });
      expect(result.literals[1]).toMatchObject({
        value: "handleLogin",
        detectionMethod: "explicit-quote",
      });
    });
  });

  describe("implicit detection - PascalCase", () => {
    it("should detect PascalCase as className", () => {
      const result = parseQueryLiterals("find AuthService");

      expect(result.literals).toHaveLength(1);
      expect(result.literals[0]).toMatchObject({
        value: "AuthService",
        confidence: "medium",
        detectionMethod: "implicit-casing",
        inferredType: "className",
      });
    });

    it("should detect multiple PascalCase words", () => {
      const result = parseQueryLiterals("UserRepository uses AuthService");

      expect(result.literals).toHaveLength(2);
      expect(result.literals[0].value).toBe("UserRepository");
      expect(result.literals[1].value).toBe("AuthService");
    });

    it("should detect longer PascalCase names", () => {
      const result = parseQueryLiterals(
        "find UserAuthenticationServiceImpl class"
      );

      expect(result.literals).toHaveLength(1);
      expect(result.literals[0].value).toBe("UserAuthenticationServiceImpl");
    });

    it("should NOT detect single uppercase word as PascalCase", () => {
      // Words like "Auth" or "User" alone are too ambiguous
      const result = parseQueryLiterals("find Auth");

      expect(result.literals).toHaveLength(0);
    });

    it("should NOT detect common words that happen to be capitalized", () => {
      // Sentence start capitalization should be ignored
      const result = parseQueryLiterals("Find the service");

      expect(result.literals).toHaveLength(0);
    });
  });

  describe("implicit detection - camelCase", () => {
    it("should detect camelCase as functionName", () => {
      const result = parseQueryLiterals("where is getUserById defined");

      expect(result.literals).toHaveLength(1);
      expect(result.literals[0]).toMatchObject({
        value: "getUserById",
        confidence: "medium",
        detectionMethod: "implicit-casing",
        inferredType: "functionName",
      });
    });

    it("should detect multiple camelCase identifiers", () => {
      const result = parseQueryLiterals("handleLogin calls validateUser");

      expect(result.literals).toHaveLength(2);
      expect(result.literals[0].value).toBe("handleLogin");
      expect(result.literals[1].value).toBe("validateUser");
    });

    it("should detect camelCase with numbers", () => {
      const result = parseQueryLiterals("find getUser2FAStatus");

      expect(result.literals).toHaveLength(1);
      expect(result.literals[0].value).toBe("getUser2FAStatus");
    });
  });

  describe("implicit detection - SCREAMING_SNAKE_CASE", () => {
    it("should detect SCREAMING_SNAKE_CASE as variableName", () => {
      const result = parseQueryLiterals("what is MAX_RETRIES");

      expect(result.literals).toHaveLength(1);
      expect(result.literals[0]).toMatchObject({
        value: "MAX_RETRIES",
        confidence: "medium",
        detectionMethod: "implicit-casing",
        inferredType: "variableName",
      });
    });

    it("should detect multiple SCREAMING_SNAKE_CASE constants", () => {
      const result = parseQueryLiterals("compare MAX_SIZE and MIN_SIZE");

      expect(result.literals).toHaveLength(2);
      expect(result.literals[0].value).toBe("MAX_SIZE");
      expect(result.literals[1].value).toBe("MIN_SIZE");
    });

    it("should detect longer SCREAMING_SNAKE_CASE", () => {
      const result = parseQueryLiterals("find DEFAULT_CONNECTION_TIMEOUT");

      expect(result.literals).toHaveLength(1);
      expect(result.literals[0].value).toBe("DEFAULT_CONNECTION_TIMEOUT");
    });
  });

  describe("implicit detection - snake_case", () => {
    it("should detect snake_case with low confidence", () => {
      const result = parseQueryLiterals("find user_auth function");

      expect(result.literals).toHaveLength(1);
      expect(result.literals[0]).toMatchObject({
        value: "user_auth",
        confidence: "low",
        detectionMethod: "implicit-casing",
        inferredType: "identifier",
      });
    });

    it("should detect longer snake_case identifiers", () => {
      const result = parseQueryLiterals("where is get_user_by_id");

      expect(result.literals).toHaveLength(1);
      expect(result.literals[0].value).toBe("get_user_by_id");
    });
  });

  describe("implicit detection - kebab-case", () => {
    it("should detect kebab-case with low confidence", () => {
      const result = parseQueryLiterals("find auth-service package");

      expect(result.literals).toHaveLength(1);
      expect(result.literals[0]).toMatchObject({
        value: "auth-service",
        confidence: "low",
        detectionMethod: "implicit-casing",
        inferredType: "packageName",
      });
    });

    it("should detect longer kebab-case identifiers", () => {
      const result = parseQueryLiterals("import user-auth-middleware");

      expect(result.literals).toHaveLength(1);
      expect(result.literals[0].value).toBe("user-auth-middleware");
    });
  });

  describe("mixed detection", () => {
    it("should handle explicit and implicit in same query", () => {
      const result = parseQueryLiterals("find `AuthService` and getUserById");

      expect(result.literals).toHaveLength(2);
      expect(result.literals[0]).toMatchObject({
        value: "AuthService",
        confidence: "high",
        detectionMethod: "explicit-backtick",
      });
      expect(result.literals[1]).toMatchObject({
        value: "getUserById",
        confidence: "medium",
        detectionMethod: "implicit-casing",
      });
    });

    it("should handle multiple pattern types", () => {
      const result = parseQueryLiterals(
        "AuthService uses getUserById with MAX_RETRIES"
      );

      expect(result.literals).toHaveLength(3);
      expect(result.literals.map((l) => l.value)).toEqual([
        "AuthService",
        "getUserById",
        "MAX_RETRIES",
      ]);
    });

    it("should prioritize explicit over implicit for same term", () => {
      // If a term is both backticked and matches a pattern,
      // it should only appear once with high confidence (deduplicated)
      const result = parseQueryLiterals("find `AuthService` class AuthService");

      // Should have 1 literal - explicit wins, implicit is deduplicated
      expect(result.literals).toHaveLength(1);
      expect(result.literals[0].confidence).toBe("high");
      expect(result.literals[0].value).toBe("AuthService");
    });
  });

  describe("remaining query", () => {
    it("should remove explicit literals from remaining query", () => {
      const result = parseQueryLiterals("find the `AuthService` class");

      expect(result.remainingQuery).toBe("find the  class");
    });

    it("should keep implicit literals in remaining query", () => {
      // Implicit literals are still useful for semantic search
      const result = parseQueryLiterals("find AuthService class");

      expect(result.remainingQuery).toBe("find AuthService class");
    });

    it("should handle query with only explicit literals", () => {
      const result = parseQueryLiterals("`AuthService`");

      expect(result.remainingQuery.trim()).toBe("");
    });

    it("should preserve spacing in remaining query", () => {
      const result = parseQueryLiterals("find   `Auth`   here");

      // Should preserve the structure even if some spaces remain
      expect(result.remainingQuery).toContain("find");
      expect(result.remainingQuery).toContain("here");
    });
  });

  describe("edge cases", () => {
    it("should handle empty query", () => {
      const result = parseQueryLiterals("");

      expect(result.literals).toHaveLength(0);
      expect(result.remainingQuery).toBe("");
    });

    it("should handle query with no literals", () => {
      const result = parseQueryLiterals("find authentication functions");

      expect(result.literals).toHaveLength(0);
      expect(result.remainingQuery).toBe("find authentication functions");
    });

    it("should handle unclosed backtick", () => {
      const result = parseQueryLiterals("find `AuthService without closing");

      // Should not crash, may or may not detect as literal
      expect(result).toBeDefined();
    });

    it("should handle unclosed quote", () => {
      const result = parseQueryLiterals('find "AuthService without closing');

      // Should not crash, may or may not detect as literal
      expect(result).toBeDefined();
    });

    it("should handle special characters in literals", () => {
      const result = parseQueryLiterals("find `@xenova/transformers`");

      expect(result.literals).toHaveLength(1);
      expect(result.literals[0].value).toBe("@xenova/transformers");
    });

    it("should handle underscores in backticked literals", () => {
      const result = parseQueryLiterals("find `_privateMethod`");

      expect(result.literals).toHaveLength(1);
      expect(result.literals[0].value).toBe("_privateMethod");
    });

    it("should not detect URLs as literals", () => {
      const result = parseQueryLiterals("find https://example.com in the code");

      // URLs have slashes and dots but shouldn't match as kebab-case
      const kebabLiterals = result.literals.filter(
        (l) => l.inferredType === "packageName"
      );
      expect(kebabLiterals).toHaveLength(0);
    });

    it("should not detect file paths as literals", () => {
      const result = parseQueryLiterals("find src/auth/login.ts");

      // File paths shouldn't be detected as literals
      expect(result.literals.filter((l) => l.value.includes("/"))).toHaveLength(
        0
      );
    });
  });

  describe("inferred types", () => {
    it("should infer className for PascalCase", () => {
      const result = parseQueryLiterals("UserService");

      expect(result.literals[0]?.inferredType).toBe("className");
    });

    it("should infer functionName for camelCase", () => {
      const result = parseQueryLiterals("handleLogin");

      expect(result.literals[0]?.inferredType).toBe("functionName");
    });

    it("should infer variableName for SCREAMING_SNAKE", () => {
      const result = parseQueryLiterals("MAX_RETRIES");

      expect(result.literals[0]?.inferredType).toBe("variableName");
    });

    it("should infer identifier for snake_case", () => {
      const result = parseQueryLiterals("user_auth");

      expect(result.literals[0]?.inferredType).toBe("identifier");
    });

    it("should infer packageName for kebab-case", () => {
      const result = parseQueryLiterals("auth-service");

      expect(result.literals[0]?.inferredType).toBe("packageName");
    });

    it("should not infer type for explicit literals", () => {
      // Explicit literals could be anything
      const result = parseQueryLiterals("`something`");

      // inferredType should be undefined for explicit literals
      // unless the value itself matches a pattern
      expect(result.literals[0]?.detectionMethod).toBe("explicit-backtick");
    });
  });
});
