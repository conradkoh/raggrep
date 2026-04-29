#!/usr/bin/env bun
/**
 * Real-world retrieval benchmark: clone pinned corpus, re-index per combo, run
 * golden queries sequentially, record index + search timings and accuracy.
 * Writes `<benchmark-name>.result.md` (default under `scripts/benchmarks/`).
 *
 * Default compares **two** presets (same `huggingface` runtime, fair model-only
 * comparison):
 * - **Fast** — `paraphrase-MiniLM-L3-v2` (winner of `bench:embeddings` throughput)
 * - **Quality** — `bge-small-en-v1.5` (stronger retrieval default)
 *
 * Usage:
 *   bun run bench:retrieval
 *   bun run scripts/benchmark-retrieval-quality.ts --benchmark-name my-run
 *   bun run scripts/benchmark-retrieval-quality.ts --matrix
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import type {
  EmbeddingModelName,
  EmbeddingRuntime,
} from "../src/domain/ports";
import { createDefaultConfig, type Config } from "../src/domain/entities";
import { saveConfig } from "../src/infrastructure/config";
import { indexDirectory } from "../src/app/indexer";
import { hybridSearch } from "../src/app/search";
import { resetGlobalEmbeddingProvider } from "../src/infrastructure/embeddings";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = path.join(
  SCRIPT_DIR,
  "eval",
  "golden-queries-next-convex.json"
);

/** Throughput harness winner: fastest vec/s on the reference repo (see `bench:embeddings`). */
const PRESET_FAST = {
  presetLabel: "Fast (paraphrase-MiniLM-L3-v2)",
  runtime: "huggingface" as EmbeddingRuntime,
  model: "paraphrase-MiniLM-L3-v2" as EmbeddingModelName,
};

/** Default “strong” local embedding for semantic code search. */
const PRESET_QUALITY = {
  presetLabel: "Quality (bge-small-en-v1.5)",
  runtime: "huggingface" as EmbeddingRuntime,
  model: "bge-small-en-v1.5" as EmbeddingModelName,
};

const RUNTIMES_MATRIX: EmbeddingRuntime[] = ["xenova", "huggingface"];

const MODELS_MATRIX: EmbeddingModelName[] = [
  "all-MiniLM-L6-v2",
  "all-MiniLM-L12-v2",
  "bge-small-en-v1.5",
  "paraphrase-MiniLM-L3-v2",
  "nomic-embed-text-v1.5",
];

interface GoldenFile {
  dataset: string;
  repoUrl: string;
  pinnedCommit: string;
  queries: Array<{
    id: string;
    query: string;
    expectedPaths: string[];
  }>;
}

interface ComboResult {
  /** Row title in the report (e.g. preset name or `runtime / model`). */
  presetLabel: string;
  runtime: EmbeddingRuntime;
  model: EmbeddingModelName;
  indexMs: number;
  retrievalTotalMs: number;
  retrievalMeanMs: number;
  /** Fraction of queries whose rank-1 chunk is from a labeled file (0–1). */
  top1Accuracy: number;
  /** Fraction of queries where some labeled file appears in the top-k chunks (0–1). */
  recallAtK: number;
  /** Average of top1Accuracy and recallAtK (0–1). */
  accuracyScore: number;
  wrongTop1Count: number;
  missAtKCount: number;
  queryCount: number;
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

function parseArgFlag(name: string): boolean {
  return process.argv.includes(name);
}

function buildMatrixCombinations(): Array<{
  presetLabel: string;
  runtime: EmbeddingRuntime;
  model: EmbeddingModelName;
}> {
  const out: Array<{
    presetLabel: string;
    runtime: EmbeddingRuntime;
    model: EmbeddingModelName;
  }> = [];
  for (const runtime of RUNTIMES_MATRIX) {
    for (const model of MODELS_MATRIX) {
      out.push({
        presetLabel: `${runtime} / ${model}`,
        runtime,
        model,
      });
    }
  }
  return out;
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

function buildEvalConfig(
  model: EmbeddingModelName,
  runtime: EmbeddingRuntime
): Config {
  const c = createDefaultConfig();
  c.extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];
  c.modules = [
    { id: "core", enabled: true, options: {} },
    {
      id: "language/typescript",
      enabled: true,
      options: {
        embeddingModel: model,
        embeddingRuntime: runtime,
      },
    },
  ];
  return c;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureRepo(
  workdir: string,
  golden: GoldenFile
): Promise<string> {
  const repoRoot = path.join(workdir, "repo");
  const gitDir = path.join(repoRoot, ".git");
  if (!(await pathExists(gitDir))) {
    await fs.mkdir(workdir, { recursive: true });
    const clone = Bun.spawn({
      cmd: ["git", "clone", golden.repoUrl, repoRoot],
      stdout: "inherit",
      stderr: "inherit",
    });
    const code = await clone.exited;
    if (code !== 0) {
      throw new Error(`git clone failed with exit ${code}`);
    }
  }

  const co = Bun.spawn({
    cmd: ["git", "-C", repoRoot, "checkout", "--force", golden.pinnedCommit],
    stdout: "inherit",
    stderr: "inherit",
  });
  const checkoutExit = await co.exited;
  if (checkoutExit !== 0) {
    throw new Error(
      `git checkout ${golden.pinnedCommit} failed; shallow clone may need full fetch`
    );
  }

  return repoRoot;
}

async function rmRaggrep(repoRoot: string): Promise<void> {
  const rag = path.join(repoRoot, ".raggrep");
  await fs.rm(rag, { recursive: true, force: true });
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

function safeBenchmarkFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return cleaned.length > 0 ? cleaned : "benchmark";
}

function escapeMdCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

async function runOneCombo(
  repoRoot: string,
  golden: GoldenFile,
  k: number,
  presetLabel: string,
  runtime: EmbeddingRuntime,
  model: EmbeddingModelName
): Promise<ComboResult> {
  await resetGlobalEmbeddingProvider();
  await rmRaggrep(repoRoot);
  await saveConfig(repoRoot, buildEvalConfig(model, runtime));

  const tIndex0 = performance.now();
  await indexDirectory(repoRoot, {
    quiet: true,
    model,
  });
  const indexMs = performance.now() - tIndex0;

  let retrievalTotalMs = 0;
  let wrongTop1Count = 0;
  let missAtKCount = 0;
  const n = golden.queries.length;

  for (const q of golden.queries) {
    const t0 = performance.now();
    const { results } = await hybridSearch(repoRoot, q.query, {
      ensureFresh: false,
      topK: k,
    });
    retrievalTotalMs += performance.now() - t0;

    const { wrongTop1, missAtK } = analyzeQuery(
      repoRoot,
      results,
      q.expectedPaths,
      k
    );
    if (wrongTop1) wrongTop1Count += 1;
    if (missAtK) missAtKCount += 1;
  }

  const top1Accuracy = n > 0 ? (n - wrongTop1Count) / n : 0;
  const recallAtK = n > 0 ? (n - missAtKCount) / n : 0;
  const accuracyScore = (top1Accuracy + recallAtK) / 2;
  const retrievalMeanMs = n > 0 ? retrievalTotalMs / n : 0;

  return {
    presetLabel,
    runtime,
    model,
    indexMs,
    retrievalTotalMs,
    retrievalMeanMs,
    top1Accuracy,
    recallAtK,
    accuracyScore,
    wrongTop1Count,
    missAtKCount,
    queryCount: n,
  };
}

function sortComboResults(rows: ComboResult[]): ComboResult[] {
  return [...rows].sort((a, b) => {
    if (b.accuracyScore !== a.accuracyScore) {
      return b.accuracyScore - a.accuracyScore;
    }
    if (a.retrievalTotalMs !== b.retrievalTotalMs) {
      return a.retrievalTotalMs - b.retrievalTotalMs;
    }
    if (a.indexMs !== b.indexMs) {
      return a.indexMs - b.indexMs;
    }
    return `${a.runtime} ${a.model}`.localeCompare(`${b.runtime} ${b.model}`);
  });
}

/** Preserve benchmark run order (fast preset then quality). */
function orderDefaultCompare(rows: ComboResult[]): ComboResult[] {
  const fast = rows.find(
    (r) =>
      r.runtime === PRESET_FAST.runtime && r.model === PRESET_FAST.model
  );
  const quality = rows.find(
    (r) =>
      r.runtime === PRESET_QUALITY.runtime && r.model === PRESET_QUALITY.model
  );
  const ordered: ComboResult[] = [];
  if (fast) ordered.push(fast);
  if (quality) ordered.push(quality);
  for (const r of rows) {
    if (r === fast || r === quality) continue;
    ordered.push(r);
  }
  return ordered;
}

function pct01(x: number): string {
  return `${(100 * x).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const workdir = parseArgString(
    "--workdir",
    path.join(process.env.TMPDIR || "/tmp", "raggrep-retrieval-eval")
  );
  const k = parseArg("--k", 10);
  const benchmarkName = safeBenchmarkFilename(
    parseArgString("--benchmark-name", "retrieval-next-convex")
  );
  const outDir = parseArgString(
    "--out-dir",
    path.join(SCRIPT_DIR, "benchmarks")
  );
  const outPath = path.join(outDir, `${benchmarkName}.result.md`);
  const matrix = parseArgFlag("--matrix");

  const goldenRaw = await fs.readFile(GOLDEN_PATH, "utf-8");
  const golden = JSON.parse(goldenRaw) as GoldenFile;

  const repoRoot = await ensureRepo(workdir, golden);

  const combinations = matrix
    ? buildMatrixCombinations()
    : [
        {
          presetLabel: PRESET_FAST.presetLabel,
          runtime: PRESET_FAST.runtime,
          model: PRESET_FAST.model,
        },
        {
          presetLabel: PRESET_QUALITY.presetLabel,
          runtime: PRESET_QUALITY.runtime,
          model: PRESET_QUALITY.model,
        },
      ];

  const comboResults: ComboResult[] = [];
  let i = 0;
  for (const { presetLabel, runtime, model } of combinations) {
    i += 1;
    console.error(`[${i}/${combinations.length}] ${presetLabel}`);
    comboResults.push(
      await runOneCombo(repoRoot, golden, k, presetLabel, runtime, model)
    );
  }

  const sorted = matrix
    ? sortComboResults(comboResults)
    : orderDefaultCompare(comboResults);
  const iso = new Date().toISOString();

  const lines: string[] = [];
  lines.push(`# Retrieval benchmark: ${benchmarkName}`);
  lines.push("");
  lines.push(`- **Generated:** ${iso}`);
  lines.push(`- **Dataset:** ${golden.dataset}`);
  lines.push(`- **Repo:** ${golden.repoUrl}`);
  lines.push(`- **Pinned commit:** \`${golden.pinnedCommit}\``);
  lines.push(`- **Workdir:** \`${workdir}\``);
  lines.push(`- **Quality @k:** top-${k} chunks vs golden paths`);
  lines.push(
    `- **Mode:** ${matrix ? "full matrix (\`--matrix\`)" : "fast vs quality (2 presets, both \`huggingface\` runtime)"}`
  );
  lines.push(`- **Combinations:** ${combinations.length}`);
  lines.push("");
  lines.push("## By model and runtime");
  lines.push("");
  if (matrix) {
    lines.push(
      "Sorted by **Score** (higher first), then faster **Retrieval total**, then faster **Index**."
    );
  } else {
    lines.push(
      "Rows are **Fast** then **Quality** (not re-sorted), both using `huggingface` runtime."
    );
  }
  lines.push("");
  lines.push(
    "| Preset | Runtime | Model | Index (ms) | Retrieval total (ms) | Retrieval mean (ms) | Top-1 acc | Recall@k | **Score** |"
  );
  lines.push(
    "|--------|---------|-------|-------------:|----------------------:|--------------------:|----------:|---------:|----------:|"
  );
  for (const r of sorted) {
    lines.push(
      `| ${escapeMdCell(r.presetLabel)} | ${r.runtime} | ${r.model} | ${r.indexMs.toFixed(0)} | ${r.retrievalTotalMs.toFixed(1)} | ${r.retrievalMeanMs.toFixed(1)} | ${pct01(r.top1Accuracy)} | ${pct01(r.recallAtK)} | **${pct01(r.accuracyScore)}** |`
    );
  }
  lines.push("");
  lines.push("### Metric definitions");
  lines.push("");
  lines.push(
    "- **Index (ms):** full `indexDirectory` pass for that runtime + model (cold `.raggrep`)."
  );
  lines.push(
    "- **Retrieval total / mean:** sum and average of per-query `hybridSearch` time (sequential queries, `ensureFresh: false`)."
  );
  lines.push(
    "- **Top-1 acc:** share of queries whose top-ranked chunk is from a golden-labeled file."
  );
  lines.push(
    "- **Recall@k:** share of queries where at least one golden file appears in the top-k chunks."
  );
  lines.push(
    "- **Score:** average of Top-1 acc and Recall@k (single balanced accuracy number, 0–100%)."
  );
  lines.push("");

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outPath, lines.join("\n"), "utf-8");

  console.log(outPath);
  await resetGlobalEmbeddingProvider();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
