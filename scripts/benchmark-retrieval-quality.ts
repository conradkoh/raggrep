#!/usr/bin/env bun
/**
 * Real-world retrieval benchmark: clone pinned corpus, re-index per combo, run
 * golden queries sequentially, record index + search timings and accuracy.
 * Writes `<benchmark-name>.result.md` (default under `scripts/benchmarks/`).
 *
 * **Default:** full matrix — every {@link EmbeddingRuntime} ×
 * {@link BENCHMARK_MODEL_NAMES} (nomic omitted), one subprocess per cell.
 * Results are merged into `<benchmark-name>.cache.json` so completed cells
 * are skipped on re-run. Use `--fresh` to clear that cache first.
 *
 * **Optional:** `--compare-two` runs only `huggingface` + fastest vs strongest
 * retrieval presets (`paraphrase-MiniLM-L3-v2` vs `bge-small-en-v1.5`).
 *
 * Usage:
 *   bun run bench:retrieval
 *   bun run scripts/benchmark-retrieval-quality.ts --compare-two
 *
 *   bun run scripts/benchmark-retrieval-quality.ts --fresh
 *
 * Internal (one matrix cell):
 *   bun run scripts/benchmark-retrieval-quality.ts --_worker-combo /path/to/payload.json
 */

import * as fs from "fs/promises";
import * as crypto from "node:crypto";
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
import { BENCHMARK_MODEL_NAMES } from "../src/infrastructure/embeddings/modelCatalog";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_FILE = fileURLToPath(import.meta.url);
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

const RETRIEVAL_CACHE_SCHEMA_VERSION = 1;

interface RetrievalBenchmarkCache {
  schemaVersion: number;
  /** Stable when golden file, k, and query set are unchanged. */
  goldenFingerprint: string;
  /** `runtime|model` → last successful {@link ComboResult}. */
  entries: Record<string, ComboResult>;
  updatedAt?: string;
}

function goldenFingerprint(golden: GoldenFile, k: number): string {
  return crypto
    .createHash("sha256")
    .update(`${golden.pinnedCommit}\0${k}\0${JSON.stringify(golden.queries)}`)
    .digest("hex")
    .slice(0, 32);
}

function comboCacheKey(
  runtime: EmbeddingRuntime,
  model: EmbeddingModelName
): string {
  return `${runtime}|${model}`;
}

function emptyCache(fingerprint: string): RetrievalBenchmarkCache {
  return {
    schemaVersion: RETRIEVAL_CACHE_SCHEMA_VERSION,
    goldenFingerprint: fingerprint,
    entries: {},
  };
}

function isCacheValid(
  parsed: unknown,
  fingerprint: string
): parsed is RetrievalBenchmarkCache {
  if (!parsed || typeof parsed !== "object") return false;
  const c = parsed as RetrievalBenchmarkCache;
  if (c.schemaVersion !== RETRIEVAL_CACHE_SCHEMA_VERSION) return false;
  if (c.goldenFingerprint !== fingerprint) return false;
  if (!c.entries || typeof c.entries !== "object") return false;
  return true;
}

async function loadRetrievalCache(
  cachePath: string,
  fingerprint: string
): Promise<RetrievalBenchmarkCache> {
  try {
    const raw = await fs.readFile(cachePath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (isCacheValid(parsed, fingerprint)) {
      return parsed;
    }
  } catch {
    // missing or corrupt
  }
  return emptyCache(fingerprint);
}

async function saveRetrievalCache(
  cachePath: string,
  cache: RetrievalBenchmarkCache
): Promise<void> {
  cache.updatedAt = new Date().toISOString();
  const dir = path.dirname(cachePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${cachePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(cache, null, 2), "utf-8");
  await fs.rename(tmp, cachePath);
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
    for (const model of BENCHMARK_MODEL_NAMES) {
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

interface ComboWorkerPayload {
  workdir: string;
  k: number;
  presetLabel: string;
  runtime: EmbeddingRuntime;
  model: EmbeddingModelName;
}

function parseComboResultLine(stdout: string): ComboResult | null {
  for (const line of stdout.split("\n")) {
    const m = line.match(/^RESULT_JSON (.+)$/);
    if (m) {
      try {
        return JSON.parse(m[1]) as ComboResult;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function comboWorkerExitOk(code: number, parsed: ComboResult | null): boolean {
  if (code === 0) return true;
  if (parsed != null && (code === 134 || code === 139)) return true;
  return false;
}

async function runWorkerComboFromArgv(): Promise<void> {
  try {
    const idx = process.argv.indexOf("--_worker-combo");
    const payloadPath = process.argv[idx + 1];
    if (!payloadPath) {
      console.error("Missing path after --_worker-combo");
      process.exit(1);
    }
    const payload = JSON.parse(
      await fs.readFile(payloadPath, "utf-8")
    ) as ComboWorkerPayload;
    const goldenRaw = await fs.readFile(GOLDEN_PATH, "utf-8");
    const golden = JSON.parse(goldenRaw) as GoldenFile;
    const repoRoot = await ensureRepo(payload.workdir, golden);
    const result = await runOneCombo(
      repoRoot,
      golden,
      payload.k,
      payload.presetLabel,
      payload.runtime,
      payload.model
    );
    process.stdout.write(`RESULT_JSON ${JSON.stringify(result)}\n`);
    await fs.unlink(payloadPath).catch(() => {});
    await resetGlobalEmbeddingProvider();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

async function runComboIsolated(
  workdir: string,
  golden: GoldenFile,
  k: number,
  presetLabel: string,
  runtime: EmbeddingRuntime,
  model: EmbeddingModelName,
  payloadBaseName: string
): Promise<ComboResult> {
  const payload: ComboWorkerPayload = {
    workdir,
    k,
    presetLabel,
    runtime,
    model,
  };
  const payloadPath = path.join(workdir, payloadBaseName);
  await fs.writeFile(payloadPath, JSON.stringify(payload), "utf-8");

  const proc = Bun.spawn({
    cmd: ["bun", "run", SCRIPT_FILE, "--_worker-combo", payloadPath],
    stdout: "pipe",
    stderr: "inherit",
  });
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  const parsed = parseComboResultLine(stdout);
  if (!comboWorkerExitOk(code, parsed) || !parsed) {
    throw new Error(
      `Combo subprocess failed (exit ${code}) for ${runtime} + ${model}. Last stdout:\n${stdout.slice(-1200)}`
    );
  }
  return parsed;
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
  if (process.argv.includes("--_worker-combo")) {
    await runWorkerComboFromArgv();
    return;
  }

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
  const cachePath = path.join(outDir, `${benchmarkName}.cache.json`);
  const compareTwo = parseArgFlag("--compare-two");
  const fresh = parseArgFlag("--fresh");

  const goldenRaw = await fs.readFile(GOLDEN_PATH, "utf-8");
  const golden = JSON.parse(goldenRaw) as GoldenFile;
  const fingerprint = goldenFingerprint(golden, k);

  if (fresh) {
    await fs.unlink(cachePath).catch(() => {});
  }

  let cache = await loadRetrievalCache(cachePath, fingerprint);

  const repoRoot = await ensureRepo(workdir, golden);

  const combinations = compareTwo
    ? [
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
      ]
    : buildMatrixCombinations();

  const useSubprocessPerCombo = !compareTwo;

  const comboResults: ComboResult[] = [];
  let i = 0;
  for (const { presetLabel, runtime, model } of combinations) {
    i += 1;
    const key = comboCacheKey(runtime, model);
    const cached = cache.entries[key];
    if (cached) {
      console.error(`[${i}/${combinations.length}] ${presetLabel} (cached)`);
      comboResults.push(cached);
      continue;
    }

    console.error(`[${i}/${combinations.length}] ${presetLabel}`);
    const safeName = `${i}-${runtime}-${model}`.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const payloadName = `raggrep-retrieval-combo-${safeName}.json`;
    let result: ComboResult;
    if (useSubprocessPerCombo) {
      result = await runComboIsolated(
        workdir,
        golden,
        k,
        presetLabel,
        runtime,
        model,
        payloadName
      );
    } else {
      result = await runOneCombo(repoRoot, golden, k, presetLabel, runtime, model);
    }
    cache.entries[key] = result;
    await saveRetrievalCache(cachePath, cache);
    comboResults.push(result);
  }

  const sorted = compareTwo
    ? orderDefaultCompare(comboResults)
    : sortComboResults(comboResults);
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
    `- **Mode:** ${compareTwo ? "`--compare-two`: fast vs quality on `huggingface` only (in-process)" : `full matrix (${RUNTIMES_MATRIX.length} runtimes × ${BENCHMARK_MODEL_NAMES.length} models), one subprocess per cell`}`
  );
  lines.push(`- **Combinations:** ${combinations.length}`);
  lines.push(`- **Cache:** \`${path.basename(cachePath)}\` (skip cells when fingerprint matches; \`--fresh\` clears)`);
  lines.push("");
  lines.push("## By model and runtime");
  lines.push("");
  if (compareTwo) {
    lines.push(
      "Rows are **Fast** then **Quality** (not re-sorted), both using `huggingface` runtime."
    );
  } else {
    lines.push(
      "Sorted by **Score** (higher first), then faster **Retrieval total**, then faster **Index**."
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
