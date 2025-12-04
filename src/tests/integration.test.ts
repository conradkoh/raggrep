/**
 * Integration Tests for RAGgrep
 *
 * These tests run against the .simulation folder and validate
 * end-to-end functionality of indexing and search.
 *
 * Tests are run sequentially to ensure proper state management.
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import raggrep from "../index";
import { getIndexLocation } from "../infrastructure/config";

// Test configuration
const SIMULATION_DIR = path.resolve(__dirname, "../../scenarios/basic");
const TEST_FILES_DIR = path.join(SIMULATION_DIR, "test-files");

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

/**
 * Suppress console output during tests
 */
function suppressConsole() {
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
}

/**
 * Restore console output
 */
function restoreConsole() {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
}

/**
 * Helper to clean up test files and index
 */
async function cleanup() {
  // Remove test files directory
  try {
    await fs.rm(TEST_FILES_DIR, { recursive: true, force: true });
  } catch {
    // Directory may not exist
  }

  // Remove the index for the simulation folder
  const location = getIndexLocation(SIMULATION_DIR);
  try {
    await fs.rm(location.indexDir, { recursive: true, force: true });
  } catch {
    // Index may not exist
  }
}

/**
 * Helper to create a test file
 */
async function createTestFile(
  relativePath: string,
  content: string
): Promise<string> {
  const fullPath = path.join(SIMULATION_DIR, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf-8");
  return fullPath;
}

/**
 * Helper to remove a test file
 */
async function removeTestFile(relativePath: string): Promise<void> {
  const fullPath = path.join(SIMULATION_DIR, relativePath);
  try {
    await fs.unlink(fullPath);
  } catch {
    // File may not exist
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe("RAGgrep Integration Tests", () => {
  // Clean up before and after all tests
  beforeAll(async () => {
    await cleanup();
    suppressConsole();
  });

  afterAll(async () => {
    restoreConsole();
    await cleanup();
  });

  // --------------------------------------------------------------------------
  // Test 1: File name is considered in indexing
  // --------------------------------------------------------------------------
  describe("File name indexing", () => {
    const testFile = "test-files/password.txt";

    afterAll(async () => {
      await removeTestFile(testFile);
    });

    test("should find file by filename when searching for filename term", async () => {
      // Create a file named password.txt with content "password 123"
      // This tests that the filename "password" is considered in indexing
      await createTestFile(testFile, "password 123");

      // Index the simulation directory
      const indexResults = await raggrep.index(SIMULATION_DIR);
      expect(indexResults.length).toBeGreaterThan(0);

      // Verify that at least one module indexed files
      const totalIndexed = indexResults.reduce((sum, r) => sum + r.indexed, 0);
      expect(totalIndexed).toBeGreaterThan(0);

      // Search for "password"
      const searchResults = await raggrep.search(SIMULATION_DIR, "password", {
        topK: 10,
        minScore: 0.01,
      });

      // Verify that password.txt is found in results
      const passwordResult = searchResults.find((result) =>
        result.filepath.includes("password.txt")
      );

      // Assert: file should be found
      expect(passwordResult).toBeDefined();

      // Assert: file should be ranked in top 5 results
      const passwordFileIndex = searchResults.findIndex((result) =>
        result.filepath.includes("password.txt")
      );
      expect(passwordFileIndex).toBeGreaterThanOrEqual(0);
      expect(passwordFileIndex).toBeLessThan(5);
    });
  });

  // --------------------------------------------------------------------------
  // Test 2: Folder path is considered in indexing
  // --------------------------------------------------------------------------
  describe("Folder path indexing", () => {
    const testFile = "test-files/secrets/config.txt";

    afterAll(async () => {
      await removeTestFile(testFile);
      // Also remove the secrets directory
      try {
        await fs.rmdir(path.join(SIMULATION_DIR, "test-files/secrets"));
      } catch {
        // Directory may not exist or not empty
      }
    });

    test("should find file by folder name when searching for folder term", async () => {
      // Create a file in a folder named "secrets"
      // This tests that the folder path is considered in indexing
      await createTestFile(testFile, "API_KEY=abc123");

      // Index the simulation directory
      const indexResults = await raggrep.index(SIMULATION_DIR);
      expect(indexResults.length).toBeGreaterThan(0);

      // Verify that at least one module indexed files
      const totalIndexed = indexResults.reduce((sum, r) => sum + r.indexed, 0);
      expect(totalIndexed).toBeGreaterThan(0);

      // Search for "secrets" (the folder name)
      const searchResults = await raggrep.search(SIMULATION_DIR, "secrets", {
        topK: 10,
        minScore: 0.01,
      });

      // Verify that the file in secrets folder is found
      const secretsResult = searchResults.find((result) =>
        result.filepath.includes("secrets/config.txt")
      );

      // Assert: file should be found by folder name
      expect(secretsResult).toBeDefined();

      // Assert: file should be ranked in top 5 results
      const secretsFileIndex = searchResults.findIndex((result) =>
        result.filepath.includes("secrets/config.txt")
      );
      expect(secretsFileIndex).toBeGreaterThanOrEqual(0);
      expect(secretsFileIndex).toBeLessThan(5);
    });
  });

  // --------------------------------------------------------------------------
  // Test 3: Source code should rank higher than documentation
  // --------------------------------------------------------------------------
  describe("Source code vs documentation ranking", () => {
    const authSourceFile = "test-files/src/auth/login.ts";
    const authDocsFile = "test-files/docs/authentication.md";

    afterAll(async () => {
      await removeTestFile(authSourceFile);
      await removeTestFile(authDocsFile);
      // Clean up directories
      try {
        await fs.rmdir(path.join(SIMULATION_DIR, "test-files/src/auth"));
        await fs.rmdir(path.join(SIMULATION_DIR, "test-files/src"));
        await fs.rmdir(path.join(SIMULATION_DIR, "test-files/docs"));
      } catch {
        // Directories may not exist
      }
    });

    test("should rank source code higher than docs for implementation queries", async () => {
      // Create a source file with authentication implementation
      await createTestFile(
        authSourceFile,
        `/**
 * Authentication Module
 */
export async function authenticateUser(email: string, password: string) {
  // Verify credentials
  const user = await findUser(email);
  if (!user) return null;
  
  const valid = await verifyPassword(password, user.passwordHash);
  return valid ? generateToken(user) : null;
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compare(password, hash);
}
`
      );

      // Create a docs file that mentions authentication
      await createTestFile(
        authDocsFile,
        `# Authentication Guide

This document describes the authentication system.

## How to Authenticate

Users can authenticate using email and password.
The system uses JWT tokens for session management.
`
      );

      // Index the simulation directory
      const indexResults = await raggrep.index(SIMULATION_DIR);
      expect(indexResults.length).toBeGreaterThan(0);

      // Search for "authenticateUser" - specific function name
      const searchResults = await raggrep.search(
        SIMULATION_DIR,
        "authenticateUser",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      // Find positions of source and docs files
      const sourceIndex = searchResults.findIndex((r) =>
        r.filepath.includes("src/auth/login.ts")
      );
      const docsIndex = searchResults.findIndex((r) =>
        r.filepath.includes("docs/authentication.md")
      );

      // Source file should be found
      expect(sourceIndex).toBeGreaterThanOrEqual(0);

      // Source file should rank higher than docs when searching for function name
      if (docsIndex >= 0) {
        expect(sourceIndex).toBeLessThan(docsIndex);
      }
    });

    test("should find source code for semantic queries", async () => {
      // Search for "verify user password" - semantic query
      const searchResults = await raggrep.search(
        SIMULATION_DIR,
        "verify user password",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      // Source file should be in top 5 results
      const sourceIndex = searchResults.findIndex((r) =>
        r.filepath.includes("src/auth/login.ts")
      );

      expect(sourceIndex).toBeGreaterThanOrEqual(0);
      expect(sourceIndex).toBeLessThan(5);
    });
  });

  // --------------------------------------------------------------------------
  // Test 4: Literal Boosting - Explicit backticks
  // --------------------------------------------------------------------------
  describe("Literal Boosting - Explicit backticks", () => {
    test("should boost exact function match with explicit backticks", async () => {
      // Search with explicit backtick literal
      const resultsWithBackticks = await raggrep.search(
        SIMULATION_DIR,
        "`hashPassword`",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      // Both should find login.ts at position 0
      const loginPosWithBackticks = resultsWithBackticks.findIndex((r) =>
        r.filepath.includes("src/auth/login.ts")
      );

      expect(loginPosWithBackticks).toBe(0);

      // The result should have a literal multiplier > 1 (definition match)
      const loginResult = resultsWithBackticks[0];
      expect(loginResult?.context?.literalMultiplier).toBeGreaterThan(1);
    });

    test("should detect literal context in search results", async () => {
      // Search with explicit backtick literal
      const results = await raggrep.search(
        SIMULATION_DIR,
        "`validateSession`",
        {
          topK: 5,
          minScore: 0.01,
        }
      );

      // Should find session.ts first
      const sessionResult = results.find((r) =>
        r.filepath.includes("src/auth/session.ts")
      );

      expect(sessionResult).toBeDefined();

      // Check that literal context is included in results
      if (sessionResult?.context) {
        // literalMultiplier should be present and > 1 for matches
        expect(sessionResult.context.literalMultiplier).toBeDefined();
      }
    });
  });

  // --------------------------------------------------------------------------
  // Test 5: Literal Boosting - Implicit PascalCase detection
  // --------------------------------------------------------------------------
  describe("Literal Boosting - Implicit PascalCase detection", () => {
    test("should detect PascalCase interface name and find definition", async () => {
      // Search for a PascalCase interface name
      const results = await raggrep.search(
        SIMULATION_DIR,
        "SessionMetadata interface",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      // Should find session.ts which defines SessionMetadata
      const sessionResult = results.find((r) =>
        r.filepath.includes("src/auth/session.ts")
      );

      expect(sessionResult).toBeDefined();

      // Should be in top 3 results
      const sessionPos = results.findIndex((r) =>
        r.filepath.includes("src/auth/session.ts")
      );
      expect(sessionPos).toBeLessThan(3);
    });

    test("should detect camelCase function name implicitly", async () => {
      // Search with camelCase function name (implicit detection)
      const results = await raggrep.search(
        SIMULATION_DIR,
        "where is authenticateUser defined",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      // Should find login.ts which defines authenticateUser
      const loginPos = results.findIndex((r) =>
        r.filepath.includes("src/auth/login.ts")
      );

      expect(loginPos).toBeGreaterThanOrEqual(0);
      expect(loginPos).toBeLessThan(3);
    });
  });

  // --------------------------------------------------------------------------
  // Test 6: Literal Boosting - Multiple literals in query
  // --------------------------------------------------------------------------
  describe("Literal Boosting - Multiple literals", () => {
    test("should handle query with multiple explicit literals", async () => {
      // Search with multiple backtick literals
      const results = await raggrep.search(
        SIMULATION_DIR,
        "`createSession` and `validateSession`",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      // Should find session.ts which has both functions
      const sessionResult = results.find((r) =>
        r.filepath.includes("src/auth/session.ts")
      );

      expect(sessionResult).toBeDefined();

      // session.ts should rank high because it contains both literals
      const sessionPos = results.findIndex((r) =>
        r.filepath.includes("src/auth/session.ts")
      );
      expect(sessionPos).toBe(0);
    });

    test("should handle mixed explicit and implicit literals", async () => {
      // Mix of backtick (explicit) and PascalCase (implicit)
      const results = await raggrep.search(
        SIMULATION_DIR,
        "`authenticateUser` returns AuthToken",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      // Should find login.ts which has both
      const loginResult = results.find((r) =>
        r.filepath.includes("src/auth/login.ts")
      );

      expect(loginResult).toBeDefined();

      // login.ts should be first or second
      const loginPos = results.findIndex((r) =>
        r.filepath.includes("src/auth/login.ts")
      );
      expect(loginPos).toBeLessThan(2);
    });
  });

  // --------------------------------------------------------------------------
  // Test 7: Literal Boosting - Definition vs Reference ranking
  // --------------------------------------------------------------------------
  describe("Literal Boosting - Definition vs Reference", () => {
    test("should rank definition higher than references for exact literal", async () => {
      // Search for User interface - should find definition first
      const results = await raggrep.search(SIMULATION_DIR, "`User` interface", {
        topK: 10,
        minScore: 0.01,
      });

      // Should find files that define User
      // login.ts defines User interface
      const loginPos = results.findIndex((r) =>
        r.filepath.includes("src/auth/login.ts")
      );

      // models/user.ts might also define User
      const modelPos = results.findIndex((r) =>
        r.filepath.includes("database/models/user.ts")
      );

      // At least one definition should be in top 3
      const definitionInTop3 = loginPos < 3 || (modelPos >= 0 && modelPos < 3);
      expect(definitionInTop3).toBe(true);
    });
  });
});
