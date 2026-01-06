/**
 * Simulation Test: Content-Based Phrase Matching
 *
 * This test validates that exact phrase queries find Markdown content
 * that contains those exact phrases, even when semantic/BM25 scores
 * are low.
 *
 * Issue: Query "authentication flow for new users" should find
 * markdown file containing that exact phrase.
 *
 * Before fix: Low scores, possibly filtered out
 * After fix: High scores due to phrase match boost
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import raggrep from "../index";

// Create a unique temporary directory for this test
const SIMULATION_DIR = path.join(os.tmpdir(), `raggrep-phrase-sim-${Date.now()}`);

// Test Markdown file with specific phrases
const AUTH_GUIDE_MD = `# Authentication Guide

## Overview

This document explains the authentication flow for new users.

When a user first registers, they go through several steps:
1. Email verification
2. Password setup
3. Two-factor authentication setup

## Session Management

The session validation process ensures secure user access.
Sessions are stored securely and validated on each request.

## Password Requirements

Password requirements include:
- Minimum 8 characters
- At least one uppercase letter
- At least one number
- At least one special character
`;

// Test TypeScript file
const SESSION_TS = `/**
 * Session Management
 */

export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
}

export function validateSession(sessionId: string): boolean {
  // Session validation logic
  return true;
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

// Helper to find a result by filepath
function findByFilepath(
  results: Array<{ filepath: string }>,
  partialPath: string
): number {
  return results.findIndex((r) => r.filepath.includes(partialPath));
}

describe("Simulation: Content-Based Phrase Matching", () => {
  beforeAll(async () => {
    suppressConsole();

    // Create simulation directory and files
    await fs.mkdir(path.join(SIMULATION_DIR, "docs"), { recursive: true });
    await fs.writeFile(
      path.join(SIMULATION_DIR, "docs", "authentication.md"),
      AUTH_GUIDE_MD
    );
    await fs.writeFile(path.join(SIMULATION_DIR, "session.ts"), SESSION_TS);

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

  describe("Exact phrase matching in Markdown", () => {
    test("'authentication flow for new users' finds markdown with exact phrase", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "authentication flow for new users",
        { topK: 10, minScore: 0.01 }
      );

      // The markdown file containing the exact phrase should be in results
      const pos = findByFilepath(results, "authentication.md");
      expect(pos).toBeGreaterThanOrEqual(0);

      // The result should have a decent score
      if (pos >= 0) {
        expect(results[pos].score).toBeGreaterThan(0.3);
      }
    });

    test("'session validation process' finds markdown section", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "session validation process",
        { topK: 10, minScore: 0.01 }
      );

      // Should find the markdown file with this phrase
      const mdPos = findByFilepath(results, "authentication.md");
      expect(mdPos).toBeGreaterThanOrEqual(0);
    });

    test("'password requirements include' finds exact phrase in markdown", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "password requirements include",
        { topK: 10, minScore: 0.01 }
      );

      const pos = findByFilepath(results, "authentication.md");
      expect(pos).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Phrase matching context in results", () => {
    test("results should include phraseMatch info in context", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "authentication flow for new users",
        { topK: 5, minScore: 0.01 }
      );

      // Find a Markdown result
      const mdResult = results.find((r) => r.filepath.includes(".md"));
      expect(mdResult).toBeDefined();

      // phraseMatch should be present in context
      if (mdResult?.context) {
        // Exact match or coverage should be defined
        expect(
          mdResult.context.phraseMatch !== undefined ||
            mdResult.context.phraseCoverage !== undefined
        ).toBe(true);
      }
    });
  });

  describe("Phrase matching vs code search", () => {
    test("both code and docs found for 'session validation'", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "session validation",
        { topK: 10, minScore: 0.01 }
      );

      // Should find both the TypeScript file and Markdown file
      const tsPos = findByFilepath(results, "session.ts");
      const mdPos = findByFilepath(results, "authentication.md");

      // Both should be in results
      expect(tsPos).toBeGreaterThanOrEqual(0);
      expect(mdPos).toBeGreaterThanOrEqual(0);
    });
  });
});

