#!/usr/bin/env bun
/**
 * Performance Benchmark Script
 * 
 * Measures indexing and search performance for sanity checks.
 * Run: bun scripts/benchmark.ts
 */

import * as path from "path";
import * as fs from "fs/promises";
import raggrep from "../src/index";

const SCENARIO_DIR = path.resolve(__dirname, "../scenarios/basic");

async function runBenchmark() {
  console.log("=".repeat(60));
  console.log("RAGgrep Performance Benchmark");
  console.log("=".repeat(60));
  console.log();

  // Check if scenario exists
  try {
    await fs.access(SCENARIO_DIR);
  } catch {
    console.error(`Scenario directory not found: ${SCENARIO_DIR}`);
    console.error("Please ensure the scenarios/basic folder exists.");
    process.exit(1);
  }

  // Benchmark 1: Cold Index
  console.log("1. INDEXING PERFORMANCE");
  console.log("-".repeat(40));

  // Clean index first
  const indexDir = path.join(SCENARIO_DIR, ".raggrep");
  try {
    await fs.rm(indexDir, { recursive: true, force: true });
  } catch {}

  const indexStart = performance.now();
  await raggrep.index(SCENARIO_DIR);
  const indexTime = performance.now() - indexStart;

  console.log(`   Cold index time: ${indexTime.toFixed(0)}ms`);

  // Benchmark 2: Warm Index (incremental)
  const warmIndexStart = performance.now();
  await raggrep.index(SCENARIO_DIR);
  const warmIndexTime = performance.now() - warmIndexStart;

  console.log(`   Warm index time: ${warmIndexTime.toFixed(0)}ms`);
  console.log();

  // Benchmark 3: Search Performance
  console.log("2. SEARCH PERFORMANCE");
  console.log("-".repeat(40));

  const queries = [
    "authenticateUser",
    "user authentication",
    "database connection pool",
    "`hashPassword`",
    "JWT token verification",
  ];

  const searchTimes: number[] = [];

  for (const query of queries) {
    const searchStart = performance.now();
    await raggrep.search(SCENARIO_DIR, query, { topK: 10 });
    const searchTime = performance.now() - searchStart;
    searchTimes.push(searchTime);
    console.log(`   "${query}": ${searchTime.toFixed(0)}ms`);
  }

  const avgSearchTime =
    searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length;
  console.log();
  console.log(`   Average search time: ${avgSearchTime.toFixed(0)}ms`);
  console.log();

  // Summary
  console.log("3. SUMMARY");
  console.log("-".repeat(40));
  console.log(`   Cold index: ${indexTime.toFixed(0)}ms`);
  console.log(`   Warm index: ${warmIndexTime.toFixed(0)}ms`);
  console.log(`   Avg search: ${avgSearchTime.toFixed(0)}ms`);
  console.log();

  // Quality check
  console.log("4. QUALITY CHECK");
  console.log("-".repeat(40));

  // Test a few critical queries
  const qualityChecks = [
    {
      query: "hashPassword",
      expectedFile: "src/auth/login.ts",
      description: "Exact function match",
    },
    {
      query: "database connection",
      expectedFile: "src/database/connection.ts",
      description: "Semantic query",
    },
    {
      query: "authentication guide",
      expectedFile: "docs/authentication.md",
      description: "Documentation query",
    },
  ];

  let passedChecks = 0;
  for (const check of qualityChecks) {
    const results = await raggrep.search(SCENARIO_DIR, check.query, {
      topK: 5,
    });
    const found = results.some((r) => r.filepath.includes(check.expectedFile));
    const status = found ? "✓ PASS" : "✗ FAIL";
    if (found) passedChecks++;
    console.log(`   ${status}: ${check.description}`);
    console.log(`          Query: "${check.query}"`);
    console.log(`          Expected: ${check.expectedFile}`);
    if (!found) {
      console.log(
        `          Actual top result: ${results[0]?.filepath || "none"}`
      );
    }
    console.log();
  }

  console.log("-".repeat(40));
  console.log(
    `   Quality checks: ${passedChecks}/${qualityChecks.length} passed`
  );
  console.log();

  // Performance thresholds
  console.log("5. PERFORMANCE THRESHOLDS");
  console.log("-".repeat(40));
  const indexOk = indexTime < 60000; // 60s
  const searchOk = avgSearchTime < 5000; // 5s
  console.log(`   Index < 60s: ${indexOk ? "✓ PASS" : "✗ FAIL"} (${indexTime.toFixed(0)}ms)`);
  console.log(`   Search < 5s: ${searchOk ? "✓ PASS" : "✗ FAIL"} (${avgSearchTime.toFixed(0)}ms)`);
  console.log();

  console.log("=".repeat(60));
  console.log("Benchmark complete!");
  console.log("=".repeat(60));
}

runBenchmark().catch(console.error);

