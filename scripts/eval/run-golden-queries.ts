#!/usr/bin/env bun
/**
 * Run golden-query retrieval checks against the repo root using the default
 * config (same evaluation shape as scripts/benchmark-retrieval-quality.ts).
 *
 * Usage:
 *   bun run scripts/eval/run-golden-queries.ts
 *   bun run scripts/eval/run-golden-queries.ts --root /path/to/repo
 *   bun run scripts/eval/run-golden-queries.ts --golden scripts/eval/golden-queries-raggrep.json --k 10
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { createDefaultConfig } from "../../src/domain/entities";
import { saveConfig } from "../../src/infrastructure/config";
import { indexDirectory } from "../../src/app/indexer";
import { hybridSearch } from "../../src/app/search";
import { resetGlobalEmbeddingProvider } from "../../src/infrastructure/embeddings";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

interface GoldenFile {
  dataset: string;
  queries: Array<{
    id: string;
    query: string;
    expectedPaths: string[];
  }>;
}

function parseArg(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  if (i === -1 || !process.argv[i + 1]) return fallback;
  const n = parseInt(process.argv[i + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseArgString(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  if (i === -1 || !process.argv[i + 1]) return fallback;
  return process.argv[i + 1];
}

function relPosix(rootDir: string, filepath: string): string {
  const abs = path.isAbsolute(filepath)
    ? filepath
    : path.join(rootDir, filepath);
  return path.relative(rootDir, abs).replace(/\\/g, "/");
}

function isExpectedFile(
  filepath: string,
  rootDir: string,
  expectedPaths: string[]
): boolean {
  const rel = relPosix(rootDir, filepath);
  return expectedPaths.some(
    (gold) => rel === gold || rel.endsWith("/" + gold)
  );
}

function analyzeQuery(
  rootDir: string,
  results: { filepath: string }[],
  expectedPaths: string[],
  k: number
): { wrongTop1: boolean; missAtK: boolean } {
  const top = results.slice(0, k);
  const missAtK =
    top.length === 0 ||
    !top.some((r) => isExpectedFile(r.filepath, rootDir, expectedPaths));
  const wrongTop1 =
    top.length === 0 ||
    !isExpectedFile(top[0].filepath, rootDir, expectedPaths);
  return { wrongTop1, missAtK };
}

async function main(): Promise<void> {
  const rootDir = path.resolve(parseArgString("--root", process.cwd()));
  const goldenPath = path.resolve(
    parseArgString(
      "--golden",
      path.join(SCRIPT_DIR, "golden-queries-raggrep.json")
    )
  );
  const k = parseArg("--k", 10);

  const raw = await fs.readFile(goldenPath, "utf-8");
  const golden = JSON.parse(raw) as GoldenFile;

  await resetGlobalEmbeddingProvider();
  const config = createDefaultConfig();
  await saveConfig(rootDir, config);

  console.error(`Indexing ${rootDir} …`);
  await indexDirectory(rootDir, { quiet: true });

  let wrongTop1 = 0;
  let missAtK = 0;
  const n = golden.queries.length;

  for (const q of golden.queries) {
    const { results } = await hybridSearch(rootDir, q.query, {
      ensureFresh: false,
      topK: k,
    });
    const row = analyzeQuery(rootDir, results, q.expectedPaths, k);
    if (row.wrongTop1) wrongTop1 += 1;
    if (row.missAtK) missAtK += 1;

    const top1 = results[0]
      ? relPosix(rootDir, results[0].filepath)
      : "(no results)";
    const ok1 = !row.wrongTop1 ? "ok" : "FAIL";
    const okK = !row.missAtK ? "ok" : "FAIL";
    console.log(
      `[${q.id}] top1=${ok1} recall@${k}=${okK} first=${top1}\n  query: ${q.query}`
    );
  }

  const top1Acc = n > 0 ? (n - wrongTop1) / n : 0;
  const recall = n > 0 ? (n - missAtK) / n : 0;
  const score = (top1Acc + recall) / 2;
  console.log("");
  console.log(
    `Dataset: ${golden.dataset} | queries=${n} | top1=${(100 * top1Acc).toFixed(1)}% | recall@${k}=${(100 * recall).toFixed(1)}% | score=${(100 * score).toFixed(1)}%`
  );

  await resetGlobalEmbeddingProvider();
  process.exit(wrongTop1 > 0 || missAtK > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
