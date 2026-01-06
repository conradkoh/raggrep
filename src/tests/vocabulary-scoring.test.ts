/**
 * Vocabulary Scoring Tests
 *
 * These tests verify that long phrase queries with vocabulary overlap
 * correctly find and rank results.
 *
 * This file serves as:
 * 1. A reproduction of the issue (long queries not finding matches)
 * 2. Verification that the vocabulary scoring fix works
 *
 * Test structure:
 * - Tests use the scenarios/basic folder
 * - Each test specifies a long query and expected file to find
 * - Tests verify the expected file appears in top N results
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as path from "path";
import raggrep from "../index";

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

// Helper: Check if file appears anywhere in results
function isInResults(
  results: Array<{ filepath: string }>,
  filePattern: string
): boolean {
  return findPosition(results, filePattern) >= 0;
}

describe("Vocabulary Scoring Tests", () => {
  beforeAll(async () => {
    suppressConsole();
    // Index the scenario directory
    await raggrep.index(SCENARIO_DIR);
  });

  afterAll(() => {
    restoreConsole();
  });

  // --------------------------------------------------------------------------
  // Test: Long phrase queries should find files with vocabulary overlap
  // --------------------------------------------------------------------------
  describe("Long phrase queries with vocabulary overlap", () => {
    test("'where is user session validated' should find session.ts", async () => {
      // This query has vocabulary overlap with validateSession:
      // Query vocab: [user, session, validated]
      // Function vocab: [validate, session]
      // Overlap: [session] + stem match [validate/validated]

      const results = await raggrep.search(
        SCENARIO_DIR,
        "where is user session validated",
        {
          topK: 10,
          minScore: 0.01, // Low threshold to see what's found
        }
      );

      // session.ts should appear in results (has validateSession function)
      expect(isInResults(results, "src/auth/session.ts")).toBe(true);
    });

    test("'how does the user authentication work' should find login.ts", async () => {
      // Query vocab: [user, authentication, work]
      // Function vocab: [authenticate, user]
      // Overlap: [user] + stem match [authenticate/authentication]

      const results = await raggrep.search(
        SCENARIO_DIR,
        "how does the user authentication work",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      // login.ts should appear in results (has authenticateUser function)
      expect(isInResults(results, "src/auth/login.ts")).toBe(true);
    });

    test("'invalidate all sessions for a user' should find session.ts in top 3", async () => {
      // Query vocab: [invalidate, sessions, user]
      // Function vocab: [invalidate, all, user, sessions]
      // High overlap - should rank highly

      const results = await raggrep.search(
        SCENARIO_DIR,
        "invalidate all sessions for a user",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      // session.ts should be in top 3 (has invalidateAllUserSessions)
      expect(isInTopN(results, "src/auth/session.ts", 3)).toBe(true);
    });

    test("'create a new session for the user' should find session.ts", async () => {
      // Query vocab: [create, session, user]
      // Function vocab: [create, session]
      // Good overlap with createSession

      const results = await raggrep.search(
        SCENARIO_DIR,
        "create a new session for the user",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      expect(isInResults(results, "src/auth/session.ts")).toBe(true);
    });

    test("'hash the user password securely' should find login.ts", async () => {
      // Query vocab: [hash, user, password, securely]
      // Function vocab: [hash, password]
      // Overlap with hashPassword

      const results = await raggrep.search(
        SCENARIO_DIR,
        "hash the user password securely",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      expect(isInResults(results, "src/auth/login.ts")).toBe(true);
    });

    test("'verify the jwt token' should find login.ts", async () => {
      // Query vocab: [verify, jwt, token]
      // Function vocab: [verify, token]
      // Overlap with verifyToken

      const results = await raggrep.search(
        SCENARIO_DIR,
        "verify the jwt token",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      expect(isInResults(results, "src/auth/login.ts")).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Test: Very long queries should still find matches
  // --------------------------------------------------------------------------
  describe("Very long natural language queries", () => {
    test("long descriptive query about session validation should find session.ts", async () => {
      const results = await raggrep.search(
        SCENARIO_DIR,
        "I need to find where the user session is validated to check if it has expired",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      expect(isInResults(results, "src/auth/session.ts")).toBe(true);
    });

    test("long question about authentication flow should find login.ts", async () => {
      const results = await raggrep.search(
        SCENARIO_DIR,
        "where in the codebase do we authenticate users with their email and password credentials",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      expect(isInResults(results, "src/auth/login.ts")).toBe(true);
    });

    test("long query about session metadata should find session.ts", async () => {
      const results = await raggrep.search(
        SCENARIO_DIR,
        "how do we store session metadata like user agent and ip address",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      // session.ts has SessionMetadata interface
      expect(isInResults(results, "src/auth/session.ts")).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Test: Vocabulary overlap ranking
  // --------------------------------------------------------------------------
  describe("Vocabulary overlap should affect ranking", () => {
    test("query with more vocabulary overlap should rank higher", async () => {
      // This query has high overlap with validateSession specifically
      const results = await raggrep.search(
        SCENARIO_DIR,
        "validate session id",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      // session.ts (validateSession) should rank higher than login.ts
      const sessionPos = findPosition(results, "src/auth/session.ts");
      const loginPos = findPosition(results, "src/auth/login.ts");

      // session.ts should be found
      expect(sessionPos).toBeGreaterThanOrEqual(0);

      // If both are found, session.ts should rank higher
      if (loginPos >= 0 && sessionPos >= 0) {
        expect(sessionPos).toBeLessThan(loginPos);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Test: Combined vocabulary and literal matching
  // --------------------------------------------------------------------------
  describe("Vocabulary + literal matching", () => {
    test("query with identifier should boost via both systems", async () => {
      // validateSession is both:
      // 1. A literal (camelCase identifier)
      // 2. Has vocabulary overlap with the query

      const results = await raggrep.search(
        SCENARIO_DIR,
        "validateSession function for checking user session",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      // Should find session.ts at top due to both literal and vocab match
      const sessionPos = findPosition(results, "src/auth/session.ts");
      expect(sessionPos).toBe(0);
    });
  });
});

// --------------------------------------------------------------------------
// Unit tests for vocabulary extraction from queries
// --------------------------------------------------------------------------
describe("Query Vocabulary Extraction", () => {
  // These tests verify the query vocabulary extraction logic
  // They don't need the index, just test the pure functions

  test("should extract meaningful words from query", async () => {
    // This will be implemented as part of the fix
    // For now, documenting expected behavior

    const query = "where is user session validated";
    // Expected vocabulary: ["user", "session", "validated"]
    // (stop words like "where", "is" should be filtered)

    // TODO: Once implemented, test extractQueryVocabulary(query)
    expect(true).toBe(true); // Placeholder
  });

  test("should handle mixed identifier and natural language", async () => {
    const query = "validateSession function for user";
    // Expected:
    // - From identifier: ["validate", "session"]
    // - From natural language: ["function", "user"]
    // Combined: ["validate", "session", "function", "user"]

    // TODO: Once implemented, test extractQueryVocabulary(query)
    expect(true).toBe(true); // Placeholder
  });
});

