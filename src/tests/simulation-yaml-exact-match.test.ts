/**
 * Simulation Test: YAML/Config File Exact Match
 *
 * This test reproduces the issue where searching for exact variable names
 * in YAML/config files (which aren't AST-parsed) wasn't finding results.
 *
 * The solution: Hybrid search with exact match track that does grep-like
 * searching across all files, not just AST-parsed ones.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import raggrep, { hybridSearch, formatHybridSearchResults } from "../index";

// Create a unique temporary directory for this test
const SIMULATION_DIR = path.join(
  os.tmpdir(),
  `raggrep-yaml-sim-${Date.now()}`
);

// Test files - YAML config files that won't be AST-parsed
const CONFIG_YAML = `# Service Configuration
database:
  host: localhost
  port: 5432
  name: myapp_db
  
services:
  auth:
    url: AUTH_SERVICE_URL
    grpc_url: AUTH_SERVICE_GRPC_URL
    timeout: 5000
  user:
    url: USER_SERVICE_URL
    grpc_url: USER_SERVICE_GRPC_URL
    timeout: 5000
  payment:
    url: PAYMENT_SERVICE_URL
    grpc_url: PAYMENT_SERVICE_GRPC_URL
    timeout: 10000
    
environment:
  API_KEY: \${AUTH_API_KEY}
  SECRET: \${JWT_SECRET}
`;

const ENV_EXAMPLE = `# Environment Variables
AUTH_SERVICE_URL=https://auth.example.com
AUTH_SERVICE_GRPC_URL=grpc://auth.example.com:9000
USER_SERVICE_URL=https://users.example.com
USER_SERVICE_GRPC_URL=grpc://users.example.com:9001
PAYMENT_SERVICE_URL=https://payments.example.com
PAYMENT_SERVICE_GRPC_URL=grpc://payments.example.com:9002
AUTH_API_KEY=your-api-key-here
JWT_SECRET=your-secret-here
DATABASE_URL=postgresql://localhost:5432/myapp_db
`;

const DOCKER_COMPOSE = `version: '3.8'
services:
  app:
    build: .
    environment:
      - AUTH_SERVICE_URL=\${AUTH_SERVICE_URL}
      - AUTH_SERVICE_GRPC_URL=\${AUTH_SERVICE_GRPC_URL}
      - DATABASE_URL=\${DATABASE_URL}
    ports:
      - "3000:3000"
  
  auth:
    image: auth-service:latest
    environment:
      - AUTH_API_KEY=\${AUTH_API_KEY}
      - JWT_SECRET=\${JWT_SECRET}
    ports:
      - "9000:9000"
`;

// A TypeScript file that references the config
const CONFIG_TS = `/**
 * Configuration loader
 */
import * as yaml from 'yaml';
import * as fs from 'fs';

interface ServiceConfig {
  url: string;
  grpc_url: string;
  timeout: number;
}

export function loadConfig() {
  const configPath = process.env.CONFIG_PATH || './config.yaml';
  const content = fs.readFileSync(configPath, 'utf-8');
  return yaml.parse(content);
}

// Environment variable names (for validation)
export const REQUIRED_ENV_VARS = [
  'AUTH_SERVICE_URL',
  'AUTH_SERVICE_GRPC_URL',
  'DATABASE_URL',
];
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

describe("Simulation: YAML/Config File Exact Match", () => {
  beforeAll(async () => {
    suppressConsole();

    // Create simulation directory and files
    await fs.mkdir(SIMULATION_DIR, { recursive: true });
    await fs.writeFile(path.join(SIMULATION_DIR, "config.yaml"), CONFIG_YAML);
    await fs.writeFile(path.join(SIMULATION_DIR, ".env.example"), ENV_EXAMPLE);
    await fs.writeFile(
      path.join(SIMULATION_DIR, "docker-compose.yml"),
      DOCKER_COMPOSE
    );
    await fs.writeFile(path.join(SIMULATION_DIR, "config.ts"), CONFIG_TS);

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

  describe("Exact match search finds YAML config values", () => {
    test("AUTH_SERVICE_GRPC_URL should find matches in YAML files", async () => {
      const results = await hybridSearch(
        SIMULATION_DIR,
        "AUTH_SERVICE_GRPC_URL",
        { topK: 10, minScore: 0.01 }
      );

      restoreConsole();
      console.log("\n=== YAML Test: AUTH_SERVICE_GRPC_URL ===");
      console.log(`Fusion applied: ${results.fusionApplied}`);

      if (results.exactMatches) {
        console.log(`\nExact matches: ${results.exactMatches.totalMatches} total`);
        results.exactMatches.files.forEach((f, i) => {
          console.log(`  ${i + 1}. ${f.filepath} (${f.matchCount} matches)`);
        });
      }

      console.log(`\nSemantic results: ${results.results.length}`);
      results.results.slice(0, 5).forEach((r, i) => {
        console.log(
          `  ${i + 1}. ${r.filepath}:${r.chunk.startLine}-${r.chunk.endLine} (${r.chunk.name || "unnamed"}) - Score: ${r.score.toFixed(4)} ${r.context?.exactMatchFusion ? "[FUSION]" : ""}`
        );
      });
      suppressConsole();

      // Should have exact matches
      expect(results.exactMatches).toBeDefined();
      expect(results.exactMatches!.totalMatches).toBeGreaterThan(0);

      // Should find matches in YAML files
      const yamlFile = results.exactMatches!.files.find((f) =>
        f.filepath.endsWith(".yaml") || f.filepath.endsWith(".yml")
      );
      expect(yamlFile).toBeDefined();

      // Fusion should be applied
      expect(results.fusionApplied).toBe(true);
    });

    test("JWT_SECRET should find matches across config files", async () => {
      const results = await hybridSearch(SIMULATION_DIR, "JWT_SECRET", {
        topK: 10,
        minScore: 0.01,
      });

      restoreConsole();
      console.log("\n=== YAML Test: JWT_SECRET ===");
      if (results.exactMatches) {
        console.log(`Exact matches: ${results.exactMatches.totalMatches} in ${results.exactMatches.totalFiles} files`);
      }
      suppressConsole();

      expect(results.exactMatches).toBeDefined();
      expect(results.exactMatches!.totalMatches).toBeGreaterThan(0);
    });

    test("DATABASE_URL should find matches", async () => {
      const results = await hybridSearch(
        SIMULATION_DIR,
        "DATABASE_URL",
        { topK: 10, minScore: 0.01 }
      );

      expect(results.exactMatches).toBeDefined();
      expect(results.exactMatches!.totalMatches).toBeGreaterThan(0);

      // Should find in .env.example and docker-compose.yml
      const envFile = results.exactMatches!.files.find((f) =>
        f.filepath.includes(".env")
      );
      const dockerFile = results.exactMatches!.files.find((f) =>
        f.filepath.includes("docker-compose")
      );

      expect(envFile || dockerFile).toBeDefined();
    });
  });

  describe("Backtick queries trigger exact search", () => {
    test("`AUTH_SERVICE_URL` with backticks finds config files", async () => {
      const results = await hybridSearch(
        SIMULATION_DIR,
        "`AUTH_SERVICE_URL`",
        { topK: 10, minScore: 0.01 }
      );

      expect(results.exactMatches).toBeDefined();
      expect(results.exactMatches!.totalMatches).toBeGreaterThan(0);
      expect(results.exactMatches!.query).toBe("AUTH_SERVICE_URL");
    });
  });

  describe("Semantic results are boosted by exact matches", () => {
    test("Results with exact matches have fusionApplied flag", async () => {
      const results = await hybridSearch(
        SIMULATION_DIR,
        "AUTH_SERVICE_URL",
        { topK: 10, minScore: 0.01 }
      );

      // Should have some results with fusion boost
      const boostedResults = results.results.filter(
        (r) => r.context?.exactMatchFusion
      );

      restoreConsole();
      console.log("\n=== Fusion Boost Test ===");
      console.log(`Total results: ${results.results.length}`);
      console.log(`Boosted by fusion: ${boostedResults.length}`);
      suppressConsole();

      expect(results.fusionApplied).toBe(true);
      expect(boostedResults.length).toBeGreaterThan(0);
    });
  });
});

describe("formatHybridSearchResults output", () => {
  // Use a separate temp dir for this test block
  const FORMAT_TEST_DIR = path.join(
    os.tmpdir(),
    `raggrep-yaml-format-${Date.now()}`
  );

  beforeAll(async () => {
    suppressConsole();

    // Create directory and files
    await fs.mkdir(FORMAT_TEST_DIR, { recursive: true });
    await fs.writeFile(path.join(FORMAT_TEST_DIR, "config.yaml"), CONFIG_YAML);
    await fs.writeFile(path.join(FORMAT_TEST_DIR, ".env.example"), ENV_EXAMPLE);
    await fs.writeFile(
      path.join(FORMAT_TEST_DIR, "docker-compose.yml"),
      DOCKER_COMPOSE
    );
    await fs.writeFile(path.join(FORMAT_TEST_DIR, "config.ts"), CONFIG_TS);

    // Index the directory
    await raggrep.index(FORMAT_TEST_DIR);
  });

  afterAll(async () => {
    restoreConsole();
    try {
      await fs.rm(FORMAT_TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  test("formats exact matches and semantic results separately", async () => {
    const results = await hybridSearch(
      FORMAT_TEST_DIR,
      "AUTH_SERVICE_GRPC_URL",
      { topK: 5, minScore: 0.01 }
    );

    restoreConsole();
    console.log("\n=== Debug: Hybrid Results Object ===");
    console.log(`Has exactMatches: ${!!results.exactMatches}`);
    console.log(`exactMatches.totalMatches: ${results.exactMatches?.totalMatches}`);
    console.log(`fusionApplied: ${results.fusionApplied}`);

    const formatted = formatHybridSearchResults(results);

    console.log("\n=== Formatted Hybrid Results ===");
    console.log(formatted);
    suppressConsole();

    // Should contain exact matches section when present
    if (results.exactMatches && results.exactMatches.totalMatches > 0) {
      expect(formatted).toContain("Exact Matches");
    }

    // Should contain the query in some form
    expect(formatted).toContain("AUTH_SERVICE_GRPC_URL");
  });
});

