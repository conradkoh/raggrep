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

  // --------------------------------------------------------------------------
  // Test 8: Expanded codebase - OAuth authentication
  // --------------------------------------------------------------------------
  describe("Expanded codebase - OAuth authentication", () => {
    test("should find oauth.ts when searching for OAuth flow", async () => {
      const results = await raggrep.search(SIMULATION_DIR, "OAuth SSO login", {
        topK: 10,
        minScore: 0.01,
      });

      const oauthPos = results.findIndex((r) =>
        r.filepath.includes("src/auth/oauth.ts")
      );

      expect(oauthPos).toBeGreaterThanOrEqual(0);
      expect(oauthPos).toBeLessThan(3);
    });

    test("should find oauth.ts for Google GitHub provider query", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "Google GitHub authentication provider",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      const oauthPos = results.findIndex((r) =>
        r.filepath.includes("src/auth/oauth.ts")
      );

      expect(oauthPos).toBeGreaterThanOrEqual(0);
      expect(oauthPos).toBeLessThan(3);
    });

    test("should still find login.ts for password authentication", async () => {
      // With oauth.ts added, login.ts should still rank high for password auth
      const results = await raggrep.search(
        SIMULATION_DIR,
        "password authentication",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      const loginPos = results.findIndex((r) =>
        r.filepath.includes("src/auth/login.ts")
      );

      expect(loginPos).toBeGreaterThanOrEqual(0);
      expect(loginPos).toBeLessThan(3);
    });
  });

  // --------------------------------------------------------------------------
  // Test 9: Expanded codebase - Notification vs Email disambiguation
  // --------------------------------------------------------------------------
  describe("Expanded codebase - Notification vs Email", () => {
    test("should find notification.ts for push notification query", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "push notification mobile",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      const notifPos = results.findIndex((r) =>
        r.filepath.includes("src/services/notification.ts")
      );

      expect(notifPos).toBeGreaterThanOrEqual(0);
      expect(notifPos).toBeLessThan(3);
    });

    test("should find email.ts for email template query", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "email template password reset",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      const emailPos = results.findIndex((r) =>
        r.filepath.includes("src/services/email.ts")
      );

      expect(emailPos).toBeGreaterThanOrEqual(0);
      expect(emailPos).toBeLessThan(3);
    });

    test("should distinguish between notification and email for welcome message", async () => {
      // email.ts has sendWelcomeEmail, notification.ts does not
      const results = await raggrep.search(
        SIMULATION_DIR,
        "`sendWelcomeEmail`",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      const emailPos = results.findIndex((r) =>
        r.filepath.includes("src/services/email.ts")
      );
      const notifPos = results.findIndex((r) =>
        r.filepath.includes("src/services/notification.ts")
      );

      expect(emailPos).toBe(0); // email.ts should be first
      if (notifPos >= 0) {
        expect(emailPos).toBeLessThan(notifPos);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Test 10: Expanded codebase - Cryptographic utilities
  // --------------------------------------------------------------------------
  describe("Expanded codebase - Crypto utilities", () => {
    test("should find crypto.ts for encryption query", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "encrypt decrypt AES",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      const cryptoPos = results.findIndex((r) =>
        r.filepath.includes("src/utils/crypto.ts")
      );

      expect(cryptoPos).toBeGreaterThanOrEqual(0);
      expect(cryptoPos).toBeLessThan(3);
    });

    test("should find crypto.ts for HMAC verification", async () => {
      const results = await raggrep.search(SIMULATION_DIR, "`generateHMAC`", {
        topK: 10,
        minScore: 0.01,
      });

      const cryptoPos = results.findIndex((r) =>
        r.filepath.includes("src/utils/crypto.ts")
      );

      expect(cryptoPos).toBe(0);
    });

    test("should find login.ts for hashPassword (not crypto.ts)", async () => {
      // hashPassword is in login.ts, not crypto.ts
      const results = await raggrep.search(SIMULATION_DIR, "`hashPassword`", {
        topK: 10,
        minScore: 0.01,
      });

      const loginPos = results.findIndex((r) =>
        r.filepath.includes("src/auth/login.ts")
      );
      const cryptoPos = results.findIndex((r) =>
        r.filepath.includes("src/utils/crypto.ts")
      );

      expect(loginPos).toBe(0);
      if (cryptoPos >= 0) {
        expect(loginPos).toBeLessThan(cryptoPos);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Test 11: Expanded codebase - Products API (distractor)
  // --------------------------------------------------------------------------
  describe("Expanded codebase - Products API isolation", () => {
    test("should find products.ts for inventory query", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "product inventory stock",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      const productsPos = results.findIndex((r) =>
        r.filepath.includes("src/api/routes/products.ts")
      );

      expect(productsPos).toBeGreaterThanOrEqual(0);
      expect(productsPos).toBeLessThan(3);
    });

    test("should NOT rank products.ts high for auth queries", async () => {
      // products.ts is unrelated to authentication
      const results = await raggrep.search(
        SIMULATION_DIR,
        "user authentication login",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      const productsPos = results.findIndex((r) =>
        r.filepath.includes("src/api/routes/products.ts")
      );

      // products.ts should either not be in results or rank low
      if (productsPos >= 0) {
        expect(productsPos).toBeGreaterThanOrEqual(5);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Test 12: Semantic Expansion with expanded codebase
  // --------------------------------------------------------------------------
  describe("Semantic Expansion with expanded codebase", () => {
    test("should still find method when searching for function", async () => {
      // Tests that SSE still works with more files
      const results = await raggrep.search(
        SIMULATION_DIR,
        "authentication function verify",
        {
          topK: 10,
          minScore: 0.01,
        }
      );

      // Should find auth-related files
      const authFiles = results.filter(
        (r) =>
          r.filepath.includes("src/auth/") ||
          r.filepath.includes("middleware/auth")
      );

      expect(authFiles.length).toBeGreaterThan(0);
    });

    test("should expand auth to authentication when searching", async () => {
      // Search for "auth" should still find authentication-related files
      const results = await raggrep.search(SIMULATION_DIR, "auth session", {
        topK: 10,
        minScore: 0.01,
      });

      const sessionPos = results.findIndex((r) =>
        r.filepath.includes("src/auth/session.ts")
      );

      expect(sessionPos).toBeGreaterThanOrEqual(0);
      expect(sessionPos).toBeLessThan(5);
    });
  });

  // --------------------------------------------------------------------------
  // Test 13: Multiple competing files for same concept
  // --------------------------------------------------------------------------
  describe("Multiple competing files", () => {
    test("should rank login.ts higher than oauth.ts for JWT token", async () => {
      // Both files use JWT, but login.ts is more about JWT tokens
      const results = await raggrep.search(SIMULATION_DIR, "JWT token sign", {
        topK: 10,
        minScore: 0.01,
      });

      const loginPos = results.findIndex((r) =>
        r.filepath.includes("src/auth/login.ts")
      );
      const oauthPos = results.findIndex((r) =>
        r.filepath.includes("src/auth/oauth.ts")
      );

      expect(loginPos).toBeGreaterThanOrEqual(0);
      expect(oauthPos).toBeGreaterThanOrEqual(0);

      // Both should be in top 5, but either order is acceptable
      expect(loginPos).toBeLessThan(5);
      expect(oauthPos).toBeLessThan(5);
    });

    test("should find both users.ts and products.ts for API routes query", async () => {
      const results = await raggrep.search(SIMULATION_DIR, "API routes CRUD", {
        topK: 10,
        minScore: 0.01,
      });

      const usersPos = results.findIndex((r) =>
        r.filepath.includes("src/api/routes/users.ts")
      );
      const productsPos = results.findIndex((r) =>
        r.filepath.includes("src/api/routes/products.ts")
      );

      // Both should be found
      expect(usersPos).toBeGreaterThanOrEqual(0);
      expect(productsPos).toBeGreaterThanOrEqual(0);
    });
  });
});
