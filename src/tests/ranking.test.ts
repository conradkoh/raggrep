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
    test("database connection pool should find connection.ts first", async () => {
      const results = await raggrep.search(
        SCENARIO_DIR,
        "database connection pool",
        {
          topK: 5,
          minScore: 0.01,
        }
      );

      const connPos = findPosition(results, "src/database/connection.ts");
      expect(connPos).toBe(0);
    });

    test("redis cache should find cache.ts first", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "redis cache", {
        topK: 5,
        minScore: 0.01,
      });

      const cachePos = findPosition(results, "src/services/cache.ts");
      expect(cachePos).toBe(0);
    });

    test("session validation should find session.ts in top 2", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "session validation", {
        topK: 5,
        minScore: 0.01,
      });

      expect(isInTopN(results, "src/auth/session.ts", 2)).toBe(true);
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
    test("user registration endpoint should find routes/users.ts in top 3", async () => {
      const results = await raggrep.search(
        SCENARIO_DIR,
        "user registration endpoint",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      expect(isInTopN(results, "src/api/routes/users.ts", 3)).toBe(true);
    });

    test("login endpoint should find routes/users.ts in top 3", async () => {
      const results = await raggrep.search(SCENARIO_DIR, "login endpoint", {
        topK: 10,
        minScore: 0.01,
      });

      expect(isInTopN(results, "src/api/routes/users.ts", 3)).toBe(true);
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
});
