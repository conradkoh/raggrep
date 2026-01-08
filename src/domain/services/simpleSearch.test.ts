/**
 * Tests for Simple Search Service
 *
 * Tests the grep-like exact text matching functionality.
 */

import { describe, test, expect } from "bun:test";
import {
  isIdentifierQuery,
  extractSearchLiteral,
  findOccurrences,
  searchFiles,
  extractIdentifiersFromContent,
  isSearchableContent,
} from "./simpleSearch";

describe("isIdentifierQuery", () => {
  describe("explicit quoting", () => {
    test("backticks are identifier queries", () => {
      expect(isIdentifierQuery("`AUTH_SERVICE_URL`")).toBe(true);
      expect(isIdentifierQuery("`getServiceUrl`")).toBe(true);
    });

    test("double quotes are identifier queries", () => {
      expect(isIdentifierQuery('"AUTH_SERVICE_URL"')).toBe(true);
      expect(isIdentifierQuery('"getServiceUrl"')).toBe(true);
    });
  });

  describe("SCREAMING_SNAKE_CASE", () => {
    test("detects SCREAMING_SNAKE_CASE", () => {
      expect(isIdentifierQuery("AUTH_SERVICE_GRPC_URL")).toBe(true);
      expect(isIdentifierQuery("MAX_RETRIES")).toBe(true);
      expect(isIdentifierQuery("API_KEY")).toBe(true);
      expect(isIdentifierQuery("DEFAULT_TIMEOUT_MS")).toBe(true);
    });
  });

  describe("camelCase", () => {
    test("detects camelCase", () => {
      expect(isIdentifierQuery("getServiceUrl")).toBe(true);
      expect(isIdentifierQuery("handleUserLogin")).toBe(true);
      expect(isIdentifierQuery("calculateTotalPrice")).toBe(true);
    });
  });

  describe("PascalCase", () => {
    test("detects PascalCase", () => {
      expect(isIdentifierQuery("ServiceRegistry")).toBe(true);
      expect(isIdentifierQuery("UserAuthenticator")).toBe(true);
      expect(isIdentifierQuery("HttpClient")).toBe(true);
    });
  });

  describe("snake_case", () => {
    test("detects snake_case", () => {
      expect(isIdentifierQuery("get_service_url")).toBe(true);
      expect(isIdentifierQuery("user_auth_token")).toBe(true);
    });
  });

  describe("kebab-case", () => {
    test("detects kebab-case", () => {
      expect(isIdentifierQuery("get-service-url")).toBe(true);
      expect(isIdentifierQuery("user-auth-middleware")).toBe(true);
    });
  });

  describe("natural language (not identifiers)", () => {
    test("rejects plain words", () => {
      expect(isIdentifierQuery("authentication")).toBe(false);
      expect(isIdentifierQuery("user login")).toBe(false);
      expect(isIdentifierQuery("how to authenticate")).toBe(false);
    });
  });
});

describe("extractSearchLiteral", () => {
  test("removes backticks", () => {
    expect(extractSearchLiteral("`AUTH_SERVICE_URL`")).toBe("AUTH_SERVICE_URL");
  });

  test("removes double quotes", () => {
    expect(extractSearchLiteral('"AUTH_SERVICE_URL"')).toBe("AUTH_SERVICE_URL");
  });

  test("trims whitespace", () => {
    expect(extractSearchLiteral("  AUTH_SERVICE_URL  ")).toBe(
      "AUTH_SERVICE_URL"
    );
  });

  test("preserves unquoted identifiers", () => {
    expect(extractSearchLiteral("AUTH_SERVICE_URL")).toBe("AUTH_SERVICE_URL");
  });
});

describe("findOccurrences", () => {
  const sampleContent = `// Configuration
export const AUTH_SERVICE_URL = "https://auth.example.com";
export const AUTH_SERVICE_GRPC_URL = "grpc://auth.example.com:9000";
export const USER_SERVICE_URL = "https://users.example.com";

// Using AUTH_SERVICE_URL in code
console.log(AUTH_SERVICE_URL);
`;

  test("finds all occurrences of a literal", () => {
    const occurrences = findOccurrences(sampleContent, "AUTH_SERVICE_URL");
    expect(occurrences.length).toBe(3);
  });

  test("includes line numbers (1-indexed)", () => {
    const occurrences = findOccurrences(sampleContent, "AUTH_SERVICE_URL");
    expect(occurrences[0].line).toBe(2);
    expect(occurrences[1].line).toBe(6);
    expect(occurrences[2].line).toBe(7);
  });

  test("includes column position", () => {
    const occurrences = findOccurrences(sampleContent, "AUTH_SERVICE_URL");
    expect(occurrences[0].column).toBeGreaterThan(0);
  });

  test("includes context lines", () => {
    const occurrences = findOccurrences(sampleContent, "AUTH_SERVICE_GRPC_URL");
    expect(occurrences.length).toBe(1);
    expect(occurrences[0].contextBefore).toBeDefined();
    expect(occurrences[0].contextAfter).toBeDefined();
  });

  test("respects maxOccurrences limit", () => {
    const occurrences = findOccurrences(sampleContent, "AUTH_SERVICE_URL", {
      maxOccurrences: 2,
    });
    expect(occurrences.length).toBe(2);
  });

  test("case-insensitive matching", () => {
    const occurrences = findOccurrences(sampleContent, "auth_service_url", {
      caseInsensitive: true,
    });
    expect(occurrences.length).toBe(3);
  });

  test("returns empty array when no matches", () => {
    const occurrences = findOccurrences(sampleContent, "NONEXISTENT_CONSTANT");
    expect(occurrences.length).toBe(0);
  });
});

describe("searchFiles", () => {
  const files = new Map([
    [
      "config.ts",
      `export const AUTH_SERVICE_URL = "https://auth.example.com";
export const AUTH_SERVICE_GRPC_URL = "grpc://auth.example.com:9000";`,
    ],
    [
      "client.ts",
      `import { AUTH_SERVICE_URL } from "./config";
console.log(AUTH_SERVICE_URL);`,
    ],
    ["unrelated.ts", `export const CACHE_TTL = 3600;`],
  ]);

  test("finds matches across multiple files", () => {
    const results = searchFiles(files, "AUTH_SERVICE_URL");
    expect(results.totalFiles).toBe(2);
    expect(results.files.length).toBe(2);
  });

  test("counts total matches correctly", () => {
    const results = searchFiles(files, "AUTH_SERVICE_URL");
    // 1 in config.ts line 1 (definition), 2 in client.ts (import + usage) = 3
    expect(results.totalMatches).toBe(3);
  });

  test("sorts by match count", () => {
    const results = searchFiles(files, "AUTH_SERVICE_URL");
    expect(results.files[0].matchCount).toBeGreaterThanOrEqual(
      results.files[1].matchCount
    );
  });

  test("returns the query in results", () => {
    const results = searchFiles(files, "AUTH_SERVICE_URL");
    expect(results.query).toBe("AUTH_SERVICE_URL");
  });

  test("respects maxFiles limit", () => {
    const results = searchFiles(files, "AUTH_SERVICE_URL", { maxFiles: 1 });
    expect(results.files.length).toBe(1);
    expect(results.truncated).toBe(true);
  });
});

describe("extractIdentifiersFromContent", () => {
  const content = `
export const AUTH_SERVICE_URL = "https://auth.example.com";
export const MAX_RETRIES = 3;

export function getServiceUrl() {
  return AuthService.getUrl();
}

const get_user_by_id = async (id) => {};
const my-component-name = "test";
`;

  test("extracts SCREAMING_SNAKE_CASE", () => {
    const identifiers = extractIdentifiersFromContent(content);
    expect(identifiers).toContain("AUTH_SERVICE_URL");
    expect(identifiers).toContain("MAX_RETRIES");
  });

  test("extracts camelCase", () => {
    const identifiers = extractIdentifiersFromContent(content);
    expect(identifiers).toContain("getServiceUrl");
  });

  test("extracts PascalCase", () => {
    const identifiers = extractIdentifiersFromContent(content);
    expect(identifiers).toContain("AuthService");
  });

  test("extracts snake_case", () => {
    const identifiers = extractIdentifiersFromContent(content);
    expect(identifiers).toContain("get_user_by_id");
  });

  test("returns unique identifiers", () => {
    const identifiers = extractIdentifiersFromContent(content);
    const uniqueCount = new Set(identifiers).size;
    expect(identifiers.length).toBe(uniqueCount);
  });
});

describe("isSearchableContent", () => {
  test("accepts normal text files", () => {
    expect(isSearchableContent("const x = 1;", "file.ts")).toBe(true);
    expect(isSearchableContent("# README", "README.md")).toBe(true);
    expect(isSearchableContent("key: value", "config.yaml")).toBe(true);
  });

  test("rejects binary content (null bytes)", () => {
    expect(isSearchableContent("binary\x00content", "file.bin")).toBe(false);
  });

  test("rejects large files", () => {
    const largeContent = "x".repeat(1024 * 1024 + 1);
    expect(isSearchableContent(largeContent, "large.ts")).toBe(false);
  });

  test("rejects binary extensions", () => {
    expect(isSearchableContent("content", "image.png")).toBe(false);
    expect(isSearchableContent("content", "archive.zip")).toBe(false);
    expect(isSearchableContent("content", "font.woff2")).toBe(false);
  });
});

