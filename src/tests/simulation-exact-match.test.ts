/**
 * Simulation Test: Exact Match Variable Name Scoring
 *
 * This test reproduces the issue where searching for exact variable names
 * like `AUTH_SERVICE_GRPC_URL` scores low because:
 *
 * 1. The prefix (AUTH, SERVICE) is very common across the codebase
 * 2. BM25 tokenization splits on underscores, creating common tokens
 * 3. Semantic similarity gets diluted by other results with similar terms
 *
 * Issue: When searching for `AUTH_SERVICE_GRPC_URL`, results containing
 * common prefixes (AUTH, SERVICE) rank higher than the exact match.
 *
 * The literal index should ensure exact matches rank first, but
 * the current scoring isn't giving enough weight to exact matches.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import raggrep from "../index";

// Create a unique temporary directory for this test
const SIMULATION_DIR = path.join(
  os.tmpdir(),
  `raggrep-exact-match-sim-${Date.now()}`
);

// Test files - simulate a codebase with many AUTH_ and SERVICE_ prefixed identifiers
const CONFIG_TS = `/**
 * Configuration Constants
 * 
 * Contains various service URLs and API keys.
 */

// Authentication service URLs
export const AUTH_SERVICE_URL = "https://auth.example.com";
export const AUTH_SERVICE_GRPC_URL = "grpc://auth.example.com:9000";
export const AUTH_SERVICE_INTERNAL_URL = "http://auth-internal:8080";
export const AUTH_API_KEY = "auth-key-12345";

// User service URLs  
export const USER_SERVICE_URL = "https://users.example.com";
export const USER_SERVICE_GRPC_URL = "grpc://users.example.com:9001";

// Payment service URLs
export const PAYMENT_SERVICE_URL = "https://payments.example.com";
export const PAYMENT_SERVICE_GRPC_URL = "grpc://payments.example.com:9002";

// Cache configuration
export const CACHE_SERVICE_URL = "redis://cache.example.com";
export const CACHE_TTL_SECONDS = 3600;
`;

const AUTH_SERVICE_TS = `/**
 * Authentication Service
 * 
 * Handles user authentication and session management.
 */

import { AUTH_SERVICE_URL, AUTH_API_KEY } from "./config";

export interface AuthResult {
  userId: string;
  token: string;
  expiresAt: Date;
}

export async function authenticateUser(username: string, password: string): Promise<AuthResult | null> {
  // Authenticate against AUTH_SERVICE_URL
  const response = await fetch(AUTH_SERVICE_URL + "/login", {
    method: "POST",
    headers: { "X-API-Key": AUTH_API_KEY },
    body: JSON.stringify({ username, password }),
  });
  
  if (!response.ok) return null;
  return response.json();
}

export async function validateAuthToken(token: string): Promise<boolean> {
  // Validate token against auth service
  const response = await fetch(AUTH_SERVICE_URL + "/validate", {
    headers: { Authorization: \`Bearer \${token}\` },
  });
  return response.ok;
}

export function createAuthSession(userId: string): string {
  // Create a new auth session
  return \`session_\${userId}_\${Date.now()}\`;
}
`;

const USER_SERVICE_TS = `/**
 * User Service
 * 
 * Handles user data and profile management.
 */

import { USER_SERVICE_URL } from "./config";

export interface User {
  id: string;
  name: string;
  email: string;
}

export async function fetchUserById(userId: string): Promise<User | null> {
  const response = await fetch(\`\${USER_SERVICE_URL}/users/\${userId}\`);
  if (!response.ok) return null;
  return response.json();
}

export async function updateUserProfile(userId: string, data: Partial<User>): Promise<User> {
  const response = await fetch(\`\${USER_SERVICE_URL}/users/\${userId}\`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return response.json();
}
`;

const GRPC_CLIENT_TS = `/**
 * GRPC Client
 * 
 * Generic GRPC client for service communication.
 */

import { 
  AUTH_SERVICE_GRPC_URL,
  USER_SERVICE_GRPC_URL, 
  PAYMENT_SERVICE_GRPC_URL 
} from "./config";

export interface GrpcConfig {
  url: string;
  timeout: number;
}

export class GrpcClient {
  constructor(private config: GrpcConfig) {}
  
  async call<T>(method: string, data: unknown): Promise<T> {
    // Generic GRPC call implementation
    console.log(\`Calling \${method} on \${this.config.url}\`);
    return {} as T;
  }
}

// Pre-configured clients
export const authGrpcClient = new GrpcClient({ 
  url: AUTH_SERVICE_GRPC_URL, 
  timeout: 5000 
});

export const userGrpcClient = new GrpcClient({ 
  url: USER_SERVICE_GRPC_URL, 
  timeout: 5000 
});

export const paymentGrpcClient = new GrpcClient({ 
  url: PAYMENT_SERVICE_GRPC_URL, 
  timeout: 10000 
});
`;

const MIDDLEWARE_TS = `/**
 * Auth Middleware
 * 
 * Request authentication middleware.
 */

import { validateAuthToken } from "./authService";

export async function authMiddleware(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }
  
  const token = authHeader.slice(7);
  return validateAuthToken(token);
}

export function requireAuth(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    const isAuth = await authMiddleware(req);
    if (!isAuth) {
      return new Response("Unauthorized", { status: 401 });
    }
    return handler(req);
  };
}
`;

// More files with common prefix patterns to stress-test the ranking
const AUTH_TYPES_TS = `/**
 * Auth Types
 * 
 * Type definitions for authentication.
 */

export interface AuthConfig {
  serviceUrl: string;
  apiKey: string;
  timeout: number;
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthSession {
  userId: string;
  token: AuthToken;
  createdAt: Date;
}

export type AuthProvider = "google" | "github" | "email";

export interface AuthProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}
`;

const AUTH_UTILS_TS = `/**
 * Auth Utilities
 * 
 * Helper functions for authentication.
 */

export function parseAuthHeader(header: string): string | null {
  if (!header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice(7);
}

export function formatAuthToken(token: string): string {
  return \`Bearer \${token}\`;
}

export function isAuthTokenExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

export function generateAuthState(): string {
  return Math.random().toString(36).substring(2);
}
`;

const SERVICE_REGISTRY_TS = `/**
 * Service Registry
 * 
 * Central registry for all services.
 */

export interface ServiceConfig {
  name: string;
  url: string;
  grpcUrl?: string;
  timeout: number;
}

export const SERVICE_REGISTRY: Record<string, ServiceConfig> = {
  auth: {
    name: "Authentication Service",
    url: "https://auth.example.com",
    grpcUrl: "grpc://auth.example.com:9000",
    timeout: 5000,
  },
  user: {
    name: "User Service", 
    url: "https://users.example.com",
    grpcUrl: "grpc://users.example.com:9001",
    timeout: 5000,
  },
  payment: {
    name: "Payment Service",
    url: "https://payments.example.com",
    grpcUrl: "grpc://payments.example.com:9002",
    timeout: 10000,
  },
};

export function getServiceUrl(serviceName: string): string | undefined {
  return SERVICE_REGISTRY[serviceName]?.url;
}

export function getServiceGrpcUrl(serviceName: string): string | undefined {
  return SERVICE_REGISTRY[serviceName]?.grpcUrl;
}
`;

const AUTH_HANDLER_TS = `/**
 * Auth Handler
 * 
 * HTTP request handlers for authentication endpoints.
 */

import { authenticateUser } from "./authService";
import { parseAuthHeader } from "./authUtils";

export async function handleLogin(req: Request): Promise<Response> {
  const body = await req.json();
  const result = await authenticateUser(body.username, body.password);
  
  if (!result) {
    return new Response(JSON.stringify({ error: "Invalid credentials" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  
  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleLogout(req: Request): Promise<Response> {
  const token = parseAuthHeader(req.headers.get("Authorization") || "");
  
  if (!token) {
    return new Response(JSON.stringify({ error: "No token provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  
  // Invalidate token logic would go here
  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleRefreshToken(req: Request): Promise<Response> {
  const body = await req.json();
  // Token refresh logic would go here
  return new Response(JSON.stringify({ accessToken: "new-token" }), {
    headers: { "Content-Type": "application/json" },
  });
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

// Helper to find a result containing a specific literal in its content
function findByContentLiteral(
  results: Array<{ chunk: { content: string } }>,
  literal: string
): number {
  return results.findIndex((r) => r.chunk.content.includes(literal));
}

// Helper to check if a literal appears in top N results
function isLiteralInTopN(
  results: Array<{ chunk: { content: string; name?: string } }>,
  literal: string,
  n: number
): boolean {
  const pos = results.findIndex(
    (r) => r.chunk.content.includes(literal) || r.chunk.name === literal
  );
  return pos >= 0 && pos < n;
}

describe("Simulation: Exact Match Variable Name Scoring", () => {
  beforeAll(async () => {
    suppressConsole();

    // Create simulation directory and files
    await fs.mkdir(SIMULATION_DIR, { recursive: true });
    await fs.writeFile(path.join(SIMULATION_DIR, "config.ts"), CONFIG_TS);
    await fs.writeFile(
      path.join(SIMULATION_DIR, "authService.ts"),
      AUTH_SERVICE_TS
    );
    await fs.writeFile(
      path.join(SIMULATION_DIR, "userService.ts"),
      USER_SERVICE_TS
    );
    await fs.writeFile(
      path.join(SIMULATION_DIR, "grpcClient.ts"),
      GRPC_CLIENT_TS
    );
    await fs.writeFile(
      path.join(SIMULATION_DIR, "middleware.ts"),
      MIDDLEWARE_TS
    );
    await fs.writeFile(
      path.join(SIMULATION_DIR, "authTypes.ts"),
      AUTH_TYPES_TS
    );
    await fs.writeFile(
      path.join(SIMULATION_DIR, "authUtils.ts"),
      AUTH_UTILS_TS
    );
    await fs.writeFile(
      path.join(SIMULATION_DIR, "serviceRegistry.ts"),
      SERVICE_REGISTRY_TS
    );
    await fs.writeFile(
      path.join(SIMULATION_DIR, "authHandler.ts"),
      AUTH_HANDLER_TS
    );

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

  describe("SCREAMING_SNAKE_CASE exact match should rank first", () => {
    test("AUTH_SERVICE_GRPC_URL should find config.ts definition first", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "AUTH_SERVICE_GRPC_URL",
        { topK: 10, minScore: 0.01 }
      );

      // Debug: log all results with scores
      restoreConsole();
      console.log("\n=== Search: AUTH_SERVICE_GRPC_URL ===");
      results.forEach((r, i) => {
        console.log(
          `${i + 1}. ${r.filepath}:${r.chunk.startLine}-${r.chunk.endLine} (${r.chunk.name || "unnamed"}) - Score: ${r.score.toFixed(4)}`
        );
        console.log(`   Context:`, JSON.stringify(r.context, null, 2));
      });
      suppressConsole();

      // The config.ts file with the AUTH_SERVICE_GRPC_URL definition should be #1
      const pos = findByContentLiteral(results, "AUTH_SERVICE_GRPC_URL");
      expect(pos).toBeGreaterThanOrEqual(0);

      // CRITICAL: The definition should be in the top 2 results
      // Currently this may fail - this is the issue we're reproducing
      expect(pos).toBeLessThanOrEqual(1);
    });

    test("USER_SERVICE_GRPC_URL should find config.ts definition first", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "USER_SERVICE_GRPC_URL",
        { topK: 10, minScore: 0.01 }
      );

      const pos = findByContentLiteral(results, "USER_SERVICE_GRPC_URL");
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThanOrEqual(1);
    });

    test("PAYMENT_SERVICE_GRPC_URL should find config.ts first", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "PAYMENT_SERVICE_GRPC_URL",
        { topK: 10, minScore: 0.01 }
      );

      const pos = findByContentLiteral(results, "PAYMENT_SERVICE_GRPC_URL");
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThanOrEqual(1);
    });
  });

  describe("Explicit backtick queries should strongly boost exact matches", () => {
    test("`AUTH_SERVICE_GRPC_URL` with backticks should find definition first", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "`AUTH_SERVICE_GRPC_URL`",
        { topK: 10, minScore: 0.01 }
      );

      restoreConsole();
      console.log("\n=== Search: `AUTH_SERVICE_GRPC_URL` (backticks) ===");
      results.forEach((r, i) => {
        console.log(
          `${i + 1}. ${r.filepath}:${r.chunk.startLine}-${r.chunk.endLine} (${r.chunk.name || "unnamed"}) - Score: ${r.score.toFixed(4)}`
        );
      });
      suppressConsole();

      // With explicit backticks, the literal index should strongly boost the match
      expect(isLiteralInTopN(results, "AUTH_SERVICE_GRPC_URL", 2)).toBe(true);
    });
  });

  describe("Common prefix tokens should not dominate results", () => {
    test("AUTH_SERVICE_GRPC_URL should rank higher than generic AUTH content", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "AUTH_SERVICE_GRPC_URL",
        { topK: 10, minScore: 0.01 }
      );

      // Find the config.ts result with AUTH_SERVICE_GRPC_URL definition
      const definitionPos = results.findIndex(
        (r) =>
          r.filepath.includes("config.ts") &&
          r.chunk.content.includes("AUTH_SERVICE_GRPC_URL")
      );

      // Find any authService.ts or middleware.ts result that just mentions AUTH
      const authServicePos = results.findIndex((r) =>
        r.filepath.includes("authService.ts")
      );

      // The definition should rank HIGHER (lower position) than auth service
      if (definitionPos >= 0 && authServicePos >= 0) {
        expect(definitionPos).toBeLessThan(authServicePos);
      }
    });
  });

  describe("Vocabulary matching works for partial matches", () => {
    test("grpc url config should find GRPC-related constants", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "grpc url config",
        { topK: 10, minScore: 0.01 }
      );

      // Should find config.ts with GRPC_URL constants
      expect(isLiteralInTopN(results, "GRPC_URL", 3)).toBe(true);
    });

    test("auth service url should find AUTH_SERVICE_URL", async () => {
      const results = await raggrep.search(
        SIMULATION_DIR,
        "auth service url",
        { topK: 10, minScore: 0.01 }
      );

      // Should find config.ts with AUTH_SERVICE_URL
      expect(isLiteralInTopN(results, "AUTH_SERVICE_URL", 3)).toBe(true);
    });
  });
});

describe("Stress Test: Many files with common AUTH/SERVICE prefix", () => {
  beforeAll(async () => {
    suppressConsole();
    // Index should already be built from previous describe block
  });

  afterAll(() => {
    restoreConsole();
  });

  test("AUTH_SERVICE_GRPC_URL should still rank first despite many AUTH_ files", async () => {
    const results = await raggrep.search(
      SIMULATION_DIR,
      "AUTH_SERVICE_GRPC_URL",
      { topK: 15, minScore: 0.01 }
    );

    restoreConsole();
    console.log("\n=== Stress Test: AUTH_SERVICE_GRPC_URL with many files ===");
    results.slice(0, 10).forEach((r, i) => {
      const hasExact = r.chunk.content.includes("AUTH_SERVICE_GRPC_URL");
      const isDefinition = r.chunk.name === "AUTH_SERVICE_GRPC_URL";
      console.log(
        `${i + 1}. ${r.filepath}:${r.chunk.startLine}-${r.chunk.endLine} (${r.chunk.name || "unnamed"}) - Score: ${r.score.toFixed(4)} ${isDefinition ? "[DEFINITION]" : ""} ${hasExact && !isDefinition ? "[CONTAINS]" : ""}`
      );
    });
    suppressConsole();

    // The definition should be #1
    const definitionPos = findByChunkName(results, "AUTH_SERVICE_GRPC_URL");
    expect(definitionPos).toBe(0);
  });

  test("SERVICE_REGISTRY should be found despite common SERVICE prefix", async () => {
    const results = await raggrep.search(SIMULATION_DIR, "SERVICE_REGISTRY", {
      topK: 10,
      minScore: 0.01,
    });

    restoreConsole();
    console.log("\n=== Search: SERVICE_REGISTRY ===");
    results.slice(0, 5).forEach((r, i) => {
      console.log(
        `${i + 1}. ${r.filepath}:${r.chunk.startLine}-${r.chunk.endLine} (${r.chunk.name || "unnamed"}) - Score: ${r.score.toFixed(4)}`
      );
    });
    suppressConsole();

    const pos = findByChunkName(results, "SERVICE_REGISTRY");
    expect(pos).toBe(0);
  });

  test("AuthConfig interface should be found among many Auth* items", async () => {
    const results = await raggrep.search(SIMULATION_DIR, "AuthConfig", {
      topK: 10,
      minScore: 0.01,
    });

    restoreConsole();
    console.log("\n=== Search: AuthConfig ===");
    results.slice(0, 5).forEach((r, i) => {
      console.log(
        `${i + 1}. ${r.filepath}:${r.chunk.startLine}-${r.chunk.endLine} (${r.chunk.name || "unnamed"}) - Score: ${r.score.toFixed(4)}`
      );
    });
    suppressConsole();

    const pos = findByChunkName(results, "AuthConfig");
    expect(pos).toBe(0);
  });

  test("handleRefreshToken should be found among many auth handlers", async () => {
    const results = await raggrep.search(
      SIMULATION_DIR,
      "handleRefreshToken",
      { topK: 10, minScore: 0.01 }
    );

    restoreConsole();
    console.log("\n=== Search: handleRefreshToken ===");
    results.slice(0, 5).forEach((r, i) => {
      console.log(
        `${i + 1}. ${r.filepath}:${r.chunk.startLine}-${r.chunk.endLine} (${r.chunk.name || "unnamed"}) - Score: ${r.score.toFixed(4)}`
      );
    });
    suppressConsole();

    const pos = findByChunkName(results, "handleRefreshToken");
    expect(pos).toBe(0);
  });
});

describe("Debug: Score Breakdown for Exact Match Issue", () => {
  beforeAll(async () => {
    suppressConsole();
    // Index should already be built from previous describe block
  });

  afterAll(() => {
    restoreConsole();
  });

  test("analyze score components for AUTH_SERVICE_GRPC_URL", async () => {
    const results = await raggrep.search(
      SIMULATION_DIR,
      "AUTH_SERVICE_GRPC_URL",
      { topK: 10, minScore: 0.01 }
    );

    restoreConsole();
    console.log("\n=== Score Breakdown Analysis ===");
    console.log("Query: AUTH_SERVICE_GRPC_URL\n");

    for (let i = 0; i < Math.min(5, results.length); i++) {
      const r = results[i];
      console.log(`--- Result ${i + 1} ---`);
      console.log(`File: ${r.filepath}`);
      console.log(`Chunk: ${r.chunk.name || "unnamed"} (${r.chunk.type})`);
      console.log(`Lines: ${r.chunk.startLine}-${r.chunk.endLine}`);
      console.log(`Final Score: ${r.score.toFixed(4)}`);

      if (r.context) {
        console.log(`Score Components:`);
        console.log(`  Semantic: ${((r.context.semanticScore as number) ?? 0).toFixed(4)}`);
        console.log(`  BM25: ${((r.context.bm25Score as number) ?? 0).toFixed(4)}`);
        console.log(`  Vocab: ${((r.context.vocabScore as number) ?? 0).toFixed(4)}`);
        console.log(`  Literal Multiplier: ${r.context.literalMultiplier}`);
        console.log(`  Literal Match Type: ${r.context.literalMatchType}`);
        console.log(`  Literal Confidence: ${r.context.literalConfidence}`);
        console.log(`  Literal Match Count: ${r.context.literalMatchCount}`);
      }

      // Check if this result contains the exact literal
      const hasExactLiteral = r.chunk.content.includes("AUTH_SERVICE_GRPC_URL");
      console.log(`Contains exact literal: ${hasExactLiteral}`);
      console.log("");
    }
    suppressConsole();

    // This test is mainly for debugging - always passes
    expect(results.length).toBeGreaterThan(0);
  });
});

/**
 * Edge Case Tests
 * 
 * These test potential edge cases where literal matching might fail
 */
describe("Edge Cases: When exact match might NOT be found", () => {
  beforeAll(async () => {
    suppressConsole();

    // Ensure the directory and index exist for this describe block
    try {
      await fs.access(SIMULATION_DIR);
    } catch {
      // Directory doesn't exist, create it
      await fs.mkdir(SIMULATION_DIR, { recursive: true });
      await fs.writeFile(path.join(SIMULATION_DIR, "config.ts"), CONFIG_TS);
      await fs.writeFile(
        path.join(SIMULATION_DIR, "authService.ts"),
        AUTH_SERVICE_TS
      );
      await fs.writeFile(
        path.join(SIMULATION_DIR, "userService.ts"),
        USER_SERVICE_TS
      );
      await fs.writeFile(
        path.join(SIMULATION_DIR, "grpcClient.ts"),
        GRPC_CLIENT_TS
      );
      await fs.writeFile(
        path.join(SIMULATION_DIR, "middleware.ts"),
        MIDDLEWARE_TS
      );
      await fs.writeFile(
        path.join(SIMULATION_DIR, "authTypes.ts"),
        AUTH_TYPES_TS
      );
      await fs.writeFile(
        path.join(SIMULATION_DIR, "authUtils.ts"),
        AUTH_UTILS_TS
      );
      await fs.writeFile(
        path.join(SIMULATION_DIR, "serviceRegistry.ts"),
        SERVICE_REGISTRY_TS
      );
      await fs.writeFile(
        path.join(SIMULATION_DIR, "authHandler.ts"),
        AUTH_HANDLER_TS
      );
      await raggrep.index(SIMULATION_DIR);
    }
  });

  afterAll(async () => {
    restoreConsole();
    // Cleanup
    try {
      await fs.rm(SIMULATION_DIR, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  test("Searching for variable that only appears in chunk content (not as chunk name)", async () => {
    // AUTH_API_KEY is defined as a variable, but the chunk is named AUTH_API_KEY
    // Let's check if references (not definitions) are handled correctly
    const results = await raggrep.search(SIMULATION_DIR, "AUTH_API_KEY", {
      topK: 10,
      minScore: 0.01,
    });

    restoreConsole();
    console.log("\n=== Edge Case: AUTH_API_KEY (definition + references) ===");
    console.log(`Found ${results.length} results`);
    results.slice(0, 8).forEach((r, i) => {
      const hasInContent = r.chunk.content.includes("AUTH_API_KEY");
      const isDefinition = r.chunk.name === "AUTH_API_KEY";
      console.log(
        `${i + 1}. ${r.filepath}:${r.chunk.startLine}-${r.chunk.endLine} (${r.chunk.name || "unnamed"}) - Score: ${r.score.toFixed(4)} ${isDefinition ? "[DEF]" : ""} ${hasInContent ? "[REF]" : ""}`
      );
      if (r.context) {
        console.log(`   literalMultiplier: ${r.context.literalMultiplier}, matchType: ${r.context.literalMatchType}`);
      }
    });
    suppressConsole();

    // Check that results contain AUTH_API_KEY somewhere
    const hasAuthApiKey = results.some(
      (r) =>
        r.chunk.name === "AUTH_API_KEY" ||
        r.chunk.content.includes("AUTH_API_KEY")
    );
    expect(hasAuthApiKey).toBe(true);
  });

  test("Searching with partial match - should vocab matching work?", async () => {
    // Searching for just "GRPC_URL" - should find all *_GRPC_URL constants
    const results = await raggrep.search(SIMULATION_DIR, "GRPC_URL", {
      topK: 10,
      minScore: 0.01,
    });

    restoreConsole();
    console.log("\n=== Edge Case: GRPC_URL (partial match) ===");
    console.log(`Found ${results.length} results`);
    results.slice(0, 8).forEach((r, i) => {
      const hasGrpcUrl = r.chunk.content.includes("GRPC_URL");
      console.log(
        `${i + 1}. ${r.filepath}:${r.chunk.startLine}-${r.chunk.endLine} (${r.chunk.name || "unnamed"}) - Score: ${r.score.toFixed(4)} ${hasGrpcUrl ? "[HAS GRPC_URL]" : ""}`
      );
    });
    suppressConsole();

    // Should find chunks containing GRPC_URL in content
    const grpcResults = results.filter((r) =>
      r.chunk.content.includes("GRPC_URL") || r.chunk.name?.includes("GRPC_URL")
    );
    expect(grpcResults.length).toBeGreaterThanOrEqual(1);
  });

  test("Searching for a function name that's also common words", async () => {
    // getServiceUrl - "get", "service", "url" are all common terms
    const results = await raggrep.search(SIMULATION_DIR, "getServiceUrl", {
      topK: 10,
      minScore: 0.01,
    });

    restoreConsole();
    console.log("\n=== Edge Case: getServiceUrl (common words function) ===");
    console.log(`Found ${results.length} results`);
    results.slice(0, 8).forEach((r, i) => {
      const hasFunction = r.chunk.content.includes("getServiceUrl");
      console.log(
        `${i + 1}. ${r.filepath}:${r.chunk.startLine}-${r.chunk.endLine} (${r.chunk.name || "unnamed"}) - Score: ${r.score.toFixed(4)} ${hasFunction ? "[HAS FUNCTION]" : ""}`
      );
    });
    suppressConsole();

    // Should find the function definition
    const hasFunction = results.some(
      (r) =>
        r.chunk.name === "getServiceUrl" ||
        r.chunk.content.includes("getServiceUrl")
    );
    expect(hasFunction).toBe(true);
  });
});

