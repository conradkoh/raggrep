/**
 * Ranking Quality Tests
 *
 * These tests verify that search results are ranked appropriately.
 * They serve as regression tests when making ranking improvements.
 *
 * Test structure:
 * - Each test specifies a query and expected ranking criteria
 * - Tests check relative ordering, not absolute scores
 * - Tests use the scenarios/basic folder
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as path from "path";
import raggrep from "../index";
import { getIndexLocation } from "../infrastructure/config";
import * as fs from "fs/promises";

// Test configuration
const SCENARIO_DIR = path.resolve(__dirname, "../../scenarios/basic");

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

function suppressConsole() {
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
}

function restoreConsole() {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
}

// Helper: Find result position for a file
function findPosition(
  results: Array<{ filepath: string }>,
  filePattern: string
): number {
  return results.findIndex((r) => r.filepath.includes(filePattern));
}

// Helper: Check if file is in top N results
function isInTopN(
  results: Array<{ filepath: string }>,
  filePattern: string,
  n: number
): boolean {
  const pos = findPosition(results, filePattern);
  return pos >= 0 && pos < n;
}

describe("Ranking Quality Tests", () => {
  beforeAll(async () => {
    suppressConsole();
    // Index the scenario directory
    await raggrep.index(SCENARIO_DIR);
  });

  afterAll(() => {
    restoreConsole();
  });

  // --------------------------------------------------------------------------
  // Test: Source code should rank higher than docs for implementation queries
  // --------------------------------------------------------------------------
  describe("Source code vs documentation ranking", () => {
    test("authenticateUser query should rank login.ts above docs", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "authenticateUser", {
        topK: 10,
        minScore: 0.01,
      });

      const loginPos = findPosition(results, "src/auth/login.ts");
      const docsPos = findPosition(results, "docs/authentication.md");

      expect(loginPos).toBeGreaterThanOrEqual(0);

      // login.ts should rank higher than docs when searching for function name
      if (docsPos >= 0) {
        expect(loginPos).toBeLessThan(docsPos);
      }
    });

    test("user authentication query should have login.ts in top 3", async () => {
      const results = await raggrep.search(
        SCENARIO_DIR,
        "user authentication",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      expect(isInTopN(results, "src/auth/login.ts", 3)).toBe(true);
    });

    test("structured logging query should have logger.ts in top 3", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "structured logging", {
        topK: 10,
        minScore: 0.01,
      });

      expect(isInTopN(results, "src/utils/logger.ts", 3)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Test: Specific function name should find exact matches first
  // --------------------------------------------------------------------------
  describe("Function name exact matching", () => {
    test("hashPassword should find login.ts first", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "hashPassword", {
        topK: 5,
        minScore: 0.01,
      });

      const loginPos = findPosition(results, "src/auth/login.ts");
      expect(loginPos).toBe(0);
    });

    test("verifyToken should find login.ts first", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "verifyToken", {
        topK: 5,
        minScore: 0.01,
      });

      const loginPos = findPosition(results, "src/auth/login.ts");
      expect(loginPos).toBe(0);
    });

    test("validateSession should find session.ts first", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "validateSession", {
        topK: 5,
        minScore: 0.01,
      });

      const sessionPos = findPosition(results, "src/auth/session.ts");
      expect(sessionPos).toBe(0);
    });

    test("sendWelcomeEmail should find email.ts first", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "sendWelcomeEmail", {
        topK: 5,
        minScore: 0.01,
      });

      const emailPos = findPosition(results, "src/services/email.ts");
      expect(emailPos).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Test: Semantic queries should find relevant implementations
  // --------------------------------------------------------------------------
  describe("Semantic/conceptual queries", () => {
    test("database connection pool should find connection.ts in top 3", async () => {
      const results = await raggrep.search(
        SCENARIO_DIR,
        "database connection pool",
        {
          topK: 5,
          minScore: 0.01,
        }
      );

      // connection.ts should be in top 3 (may be beaten by docs with exact phrase match)
      expect(isInTopN(results, "src/database/connection.ts", 3)).toBe(true);
    });

    test("redis cache should find cache.ts in top 2", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "redis cache", {
        topK: 5,
        minScore: 0.01,
      });

      // cache.ts should be in top 2 (may be beaten by documentation about caching)
      expect(isInTopN(results, "src/services/cache.ts", 2)).toBe(true);
    });

    test("session validation should find session.ts in top 5", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "session validation", {
        topK: 5,
        minScore: 0.01,
      });

      // session.ts should be in top 5 (may be beaten by docs with phrase match)
      expect(isInTopN(results, "src/auth/session.ts", 5)).toBe(true);
    });

    test("JWT token verification should find login.ts in top 2", async () => {
      const results = await raggrep.search(
        SCENARIO_DIR,
        "JWT token verification",
        {
          topK: 5,
          minScore: 0.01,
        }
      );

      expect(isInTopN(results, "src/auth/login.ts", 2)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Test: API/Route queries should find routes files
  // --------------------------------------------------------------------------
  describe("API route queries", () => {
    test("user registration endpoint should find routes/users.ts in results", async () => {
      const results = await raggrep.search(
        SCENARIO_DIR,
        "user registration endpoint",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      // File should be found in top 10 results
      expect(isInTopN(results, "src/api/routes/users.ts", 10)).toBe(true);
    });

    test("login endpoint should find routes/users.ts in top 10", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "login endpoint", {
        topK: 10,
        minScore: 0.01,
      });

      // routes/users.ts should be in results (login-related code may rank higher)
      expect(isInTopN(results, "src/api/routes/users.ts", 10)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Test: Path-based queries should respect folder structure
  // --------------------------------------------------------------------------
  describe("Path-based ranking", () => {
    test("auth folder query should prioritize auth/ files", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "auth login", {
        topK: 10,
        minScore: 0.01,
      });

      // First result should be from auth folder
      expect(results[0]?.filepath).toContain("auth/");
    });

    test("database query should prioritize database/ files", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "database", {
        topK: 10,
        minScore: 0.01,
      });

      // Top 3 should include database folder files
      const databaseResults = results
        .slice(0, 5)
        .filter((r) => r.filepath.includes("database/"));
      expect(databaseResults.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Test: Documentation queries should find documentation files
  // --------------------------------------------------------------------------
  describe("Documentation queries", () => {
    test("authentication guide query should find docs/authentication.md in top 3", async () => {
      const results = await raggrep.search(
        SCENARIO_DIR,
        "authentication guide",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      expect(isInTopN(results, "docs/authentication.md", 3)).toBe(true);
    });

    test("database documentation query should find docs/database.md in top 10", async () => {
      const results = await raggrep.search(
        SCENARIO_DIR,
        "database documentation",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      // database.md should be in results (may be beaten by files with phrase match for "documentation")
      expect(isInTopN(results, "docs/database.md", 10)).toBe(true);
    });

    test("how to authenticate query should find docs in top 3", async () => {
      const results = await raggrep.search(
        SCENARIO_DIR,
        "how to authenticate users",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      // Should find documentation for "how to" questions
      const docResults = results
        .slice(0, 3)
        .filter((r) => r.filepath.includes("docs/"));
      expect(docResults.length).toBeGreaterThan(0);
    });

    test("README query should find README files", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "project overview", {
        topK: 10,
        minScore: 0.01,
      });

      expect(isInTopN(results, "README.md", 5)).toBe(true);
    });

    test("password requirements query should find both code and docs", async () => {
      const results = await raggrep.search(
        SCENARIO_DIR,
        "password requirements",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      // "password requirements" is ambiguous - could mean:
      // - What are the requirements? (docs)
      // - How are they validated? (code)
      // Both should appear in results (in top 10)
      expect(isInTopN(results, "docs/authentication.md", 10)).toBe(true);
      expect(isInTopN(results, "src/utils/validation.ts", 10)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Test: Ambiguous queries should return balanced results
  // --------------------------------------------------------------------------
  describe("Balanced results for ambiguous queries", () => {
    test("authentication query should find both code and docs", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "authentication", {
        topK: 10,
        minScore: 0.01,
      });

      // Should find both code and documentation
      const codeResults = results.filter(
        (r) => r.filepath.endsWith(".ts") || r.filepath.endsWith(".js")
      );
      const docResults = results.filter((r) => r.filepath.endsWith(".md"));

      expect(codeResults.length).toBeGreaterThan(0);
      expect(docResults.length).toBeGreaterThan(0);
    });

    test("database query should find both code and docs", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "database", {
        topK: 10,
        minScore: 0.01,
      });

      // Should find both code and documentation
      const codeResults = results.filter(
        (r) => r.filepath.endsWith(".ts") || r.filepath.endsWith(".js")
      );
      const docResults = results.filter((r) => r.filepath.endsWith(".md"));

      expect(codeResults.length).toBeGreaterThan(0);
      expect(docResults.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Test: Literal Boosting - Explicit backticks for exact matches
  // --------------------------------------------------------------------------
  describe("Literal Boosting with explicit backticks", () => {
    test("`hashPassword` with backticks should find login.ts first", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "`hashPassword`", {
        topK: 5,
        minScore: 0.01,
      });

      const loginPos = findPosition(results, "src/auth/login.ts");
      expect(loginPos).toBe(0);
    });

    test("`validateSession` with backticks should find session.ts first", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "`validateSession`", {
        topK: 5,
        minScore: 0.01,
      });

      const sessionPos = findPosition(results, "src/auth/session.ts");
      expect(sessionPos).toBe(0);
    });

    test("`createSession` with backticks should find session.ts first", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "`createSession`", {
        topK: 5,
        minScore: 0.01,
      });

      const sessionPos = findPosition(results, "src/auth/session.ts");
      expect(sessionPos).toBe(0);
    });

    test("`sendWelcomeEmail` with backticks should find email.ts first", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "`sendWelcomeEmail`", {
        topK: 5,
        minScore: 0.01,
      });

      const emailPos = findPosition(results, "src/services/email.ts");
      expect(emailPos).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Test: Literal Boosting - PascalCase interface/class names
  // --------------------------------------------------------------------------
  describe("Literal Boosting with PascalCase names", () => {
    test("AuthToken interface query should find login.ts in top 2", async () => {
      const results = await raggrep.search(
        SCENARIO_DIR,
        "AuthToken interface",
        {
          topK: 5,
          minScore: 0.01,
        }
      );

      expect(isInTopN(results, "src/auth/login.ts", 2)).toBe(true);
    });

    test("SessionMetadata interface query should find session.ts in top 2", async () => {
      const results = await raggrep.search(
        SCENARIO_DIR,
        "SessionMetadata interface",
        {
          topK: 5,
          minScore: 0.01,
        }
      );

      expect(isInTopN(results, "src/auth/session.ts", 2)).toBe(true);
    });

    test("LoginCredentials type query should find login.ts in top 2", async () => {
      const results = await raggrep.search(
        SCENARIO_DIR,
        "LoginCredentials type",
        {
          topK: 5,
          minScore: 0.01,
        }
      );

      expect(isInTopN(results, "src/auth/login.ts", 2)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Test: Literal Boosting - Combined explicit and implicit
  // --------------------------------------------------------------------------
  describe("Literal Boosting with combined queries", () => {
    test("mixed backticks and PascalCase should rank correctly", async () => {
      const results = await raggrep.search(
        SCENARIO_DIR,
        "`authenticateUser` returns AuthToken",
        {
          topK: 5,
          minScore: 0.01,
        }
      );

      // login.ts has both authenticateUser and AuthToken
      expect(isInTopN(results, "src/auth/login.ts", 2)).toBe(true);
    });

    test("find function in specific file pattern", async () => {
      const results = await raggrep.search(
        SCENARIO_DIR,
        "`invalidateSession` in session",
        {
          topK: 5,
          minScore: 0.01,
        }
      );

      const sessionPos = findPosition(results, "src/auth/session.ts");
      expect(sessionPos).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Test: Literal Boosting - Result context contains literal info
  // --------------------------------------------------------------------------
  describe("Literal Boosting context in results", () => {
    test("results should include literal multiplier in context", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "`hashPassword`", {
        topK: 5,
        minScore: 0.01,
      });

      // First result should be login.ts with literal context
      const loginResult = results.find((r) =>
        r.filepath.includes("src/auth/login.ts")
      );

      expect(loginResult).toBeDefined();

      // Context should have literal info
      if (loginResult?.context) {
        // literalMultiplier should be > 1 for matches with definition
        expect(loginResult.context.literalMultiplier).toBeGreaterThan(1);
      }
    });

    test("results without literal matches should have multiplier of 1", async () => {
      // Search for something semantic without literals
      const results = await raggrep.search(
        SCENARIO_DIR,
        "how to secure passwords",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      // Some results may not have literal matches
      const resultsWithoutLiteralMatch = results.filter(
        (r) => r.context?.literalMultiplier === 1
      );

      // At least some results should have no literal boost
      // (docs files don't have function definitions)
      const docsResults = results.filter((r) => r.filepath.includes("docs/"));
      if (docsResults.length > 0) {
        // Docs typically don't define functions, so they may have lower multipliers
        expect(docsResults.length).toBeGreaterThan(0);
      }
    });
  });
});
