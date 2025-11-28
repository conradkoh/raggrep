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
const SIMULATION_DIR = path.resolve(__dirname, "../../.simulation");
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
});
