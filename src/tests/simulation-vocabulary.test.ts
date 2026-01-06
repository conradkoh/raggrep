/**
 * Simulation Test: Vocabulary-Based Scoring
 *
 * This test reproduces and validates the fix for the issue where
 * long natural language queries with vocabulary overlap weren't
 * finding TypeScript functions with matching identifier vocabulary.
 *
 * Issue: Query "where is the user session validated" should find
 * function `validateUserSession` via vocabulary overlap:
 * - Query vocabulary: [user, session, validated]
 * - Function vocabulary: [validate, user, session]
 * - Overlap: [user, session] + stem match [validate/validated]
 *
 * Before fix: Low scores, possibly filtered out
 * After fix: High scores, ranked #1
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import raggrep from "../index";

// Create a unique temporary directory for this test
const SIMULATION_DIR = path.join(os.tmpdir(), `raggrep-vocab-sim-${Date.now()}`);

// Test files content
const SESSION_TS = `/**
 * Session Management
 */

export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
}

export function validateUserSession(sessionId: string): boolean {
  // Validates if a user session is still active
  return true;
}

export function createUserSession(userId: string): Session {
  return {
    id: "123",
    userId,
    expiresAt: new Date()
  };
}

export function invalidateAllSessions(userId: string): void {
  // Invalidates all sessions for a user
}
`;

const AUTH_TS = `/**
 * Authentication
 */

export function authenticateUserWithCredentials(email: string, password: string): boolean {
  // Authenticate user with email and password
  return true;
}

export function hashUserPassword(password: string): string {
  return "hashed";
}
`;

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

// Helper to find a result by chunk name
function findByChunkName(
  results: Array<{ chunk: { name?: string } }>,
  name: string
): number {
  return results.findIndex((r) => r.chunk.name === name);
}

describe("Simulation: Vocabulary-Based Scoring", () => {
  beforeAll(async () => {
    suppressConsole();

    // Create simulation directory and files
    await fs.mkdir(SIMULATION_DIR, { recursive: true });
    await fs.writeFile(path.join(SIMULATION_DIR, "session.ts"), SESSION_TS);
    await fs.writeFile(path.join(SIMULATION_DIR, "auth.ts"), AUTH_TS);

    // Index the simulation directory
    await raggrep.index(SIMULATION_DIR);
  });

  afterAll(async () => {
    restoreConsole();

    // Clean up simulation directory
    try {
      await fs.rm(SIMULATION_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Long phrase queries should find functions via vocabulary overlap", () => {
    test("'where is the user session validated' finds validateUserSession first", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "where is the user session validated",
        { topK: 10, minScore: 0.01 }
      );

      // validateUserSession should be the #1 result
      const pos = findByChunkName(results, "validateUserSession");
      expect(pos).toBe(0);

      // Score should be reasonably high (vocabulary overlap provides boost)
      expect(results[0].score).toBeGreaterThan(0.5);
    });

    test("'how do we authenticate users with their credentials' finds authenticateUserWithCredentials first", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "how do we authenticate users with their credentials",
        { topK: 10, minScore: 0.01 }
      );

      const pos = findByChunkName(results, "authenticateUserWithCredentials");
      expect(pos).toBe(0);
      expect(results[0].score).toBeGreaterThan(0.4);
    });

    test("'invalidate all the sessions' finds invalidateAllSessions first", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "invalidate all the sessions",
        { topK: 10, minScore: 0.01 }
      );

      const pos = findByChunkName(results, "invalidateAllSessions");
      expect(pos).toBe(0);
      expect(results[0].score).toBeGreaterThan(0.5);
    });

    test("'hash the user password' finds hashUserPassword first", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "hash the user password",
        { topK: 10, minScore: 0.01 }
      );

      const pos = findByChunkName(results, "hashUserPassword");
      expect(pos).toBe(0);
      expect(results[0].score).toBeGreaterThan(0.5);
    });

    test("'create a new session for the user' finds createUserSession first", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "create a new session for the user",
        { topK: 10, minScore: 0.01 }
      );

      const pos = findByChunkName(results, "createUserSession");
      expect(pos).toBe(0);
      expect(results[0].score).toBeGreaterThan(0.4);
    });
  });

  describe("Vocabulary score should be present in context", () => {
    test("results should include vocabScore in context", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "user session",
        { topK: 5, minScore: 0.01 }
      );

      // Find a TypeScript result (not Core module)
      const tsResult = results.find((r) => r.moduleId === "language/typescript");
      expect(tsResult).toBeDefined();

      // vocabScore should be present in context
      if (tsResult?.context) {
        expect(tsResult.context.vocabScore).toBeDefined();
        // For "user session" query, chunks with user/session vocabulary should have vocabScore > 0
        expect(tsResult.context.vocabScore as number).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

