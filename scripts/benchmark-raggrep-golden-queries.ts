#!/usr/bin/env bun
/**
 * RAGgrep golden-query benchmark for the next-convex-starter-app corpus.
 * Wipes the index, indexes once (core + language/typescript + docs/markdown), then
 * runs several search passes with different {@link SearchOptions.rankingWeights} to
 * compare objective metrics—especially whether lowering semantic weight on Markdown
 * reduces cases where `.md` wins top-1 over code with clear literals.
 *
 * Default: 10 weight passes (`WEIGHT_SWEEP`), one report whose primary section is a comparison table.
 *
 * Usage:
 *   bun run scripts/benchmark-raggrep-golden-queries.ts
 *   bun run scripts/benchmark-raggrep-golden-queries.ts --passes 10 --k 10 --fast
 *   bun run scripts/benchmark-raggrep-golden-queries.ts --weights-json ./my.json
 *   bun run scripts/benchmark-raggrep-golden-queries.ts --cache
 *   bun run scripts/benchmark-raggrep-golden-queries.ts --per-query
 */

import * as fs from "fs/promises";
import * as crypto from "node:crypto";
import * as path from "path";
import { fileURLToPath } from "url";
import type { EmbeddingModelName, EmbeddingRuntime } from "../src/domain/ports";
import type {
  RankingWeightsPartial,
  SearchOptions,
  RankingWeightsConfig,
} from "../src/domain/entities";
import {
  createDefaultConfig,
  mergeRankingWeights,
  type Config,
} from "../src/domain/entities";
import { saveConfig } from "../src/infrastructure/config";
import { indexDirectory } from "../src/app/indexer";
import { hybridSearch } from "../src/app/search";
import {
  resetGlobalEmbeddingProvider,
  getEmbeddingModelId,
} from "../src/infrastructure/embeddings";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_GOLDEN = path.join(
  SCRIPT_DIR,
  "eval",
  "golden-queries-next-convex-50.json"
);

/** NPM package used for ONNX embeddings (matches {@link EmbeddingRuntime}). */
function getEmbeddingPackage(runtime: EmbeddingRuntime): string {
  return runtime === "xenova"
    ? "@xenova/transformers"
    : "@huggingface/transformers";
}

const PRESET_FAST = {
  label: "Fast (paraphrase-MiniLM-L3-v2)",
  runtime: "huggingface" as EmbeddingRuntime,
  model: "paraphrase-MiniLM-L3-v2" as EmbeddingModelName,
};

const PRESET_QUALITY = {
  label: "Quality (bge-small-en-v1.5)",
  runtime: "huggingface" as EmbeddingRuntime,
  model: "bge-small-en-v1.5" as EmbeddingModelName,
};

/**
 * Built-in sweep — refined grid around current CLI defaults (ts 0.45/0.40/0.15).
 * Replace this block when starting a new tuning wave.
 */
const WEIGHT_SWEEP: Array<{
  id: string;
  label: string;
  partial?: RankingWeightsPartial;
}> = [
  { id: "p0", label: "baseline (defaults)" },
  {
    id: "p1",
    label: "ts 0.40 / 0.45 / 0.15 (more BM25)",
    partial: {
      typescript: { semantic: 0.4, bm25: 0.45, vocab: 0.15 },
    },
  },
  {
    id: "p2",
    label: "ts 0.48 / 0.37 / 0.15 (more semantic)",
    partial: {
      typescript: { semantic: 0.48, bm25: 0.37, vocab: 0.15 },
    },
  },
  {
    id: "p3",
    label: "ts 0.38 / 0.47 / 0.15 (max BM25)",
    partial: {
      typescript: { semantic: 0.38, bm25: 0.47, vocab: 0.15 },
    },
  },
  {
    id: "p4",
    label: "ts 0.43 / 0.42 / 0.15 (balanced)",
    partial: {
      typescript: { semantic: 0.43, bm25: 0.42, vocab: 0.15 },
    },
  },
  {
    id: "p5",
    label: "md 0.65 / 0.35 (gentle sem↓)",
    partial: { markdown: { semantic: 0.65, bm25: 0.35 } },
  },
  {
    id: "p6",
    label: "md 0.58 / 0.42",
    partial: { markdown: { semantic: 0.58, bm25: 0.42 } },
  },
  {
    id: "p7",
    label: "ts vocab↑ 0.42 / 0.40 / 0.18",
    partial: {
      typescript: { semantic: 0.42, bm25: 0.4, vocab: 0.18 },
    },
  },
  {
    id: "p8",
    label: "discriminative boostCap 0.12",
    partial: { discriminative: { boostCap: 0.12 } },
  },
  {
    id: "p9",
    label: "combo ts 0.43/0.42 + md 0.62/0.33 doc 0.02 (vs default doc 0.03)",
    partial: {
      typescript: { semantic: 0.43, bm25: 0.42, vocab: 0.15 },
      markdown: { semantic: 0.62, bm25: 0.33, docIntentBoost: 0.02 },
    },
  },
];

interface GoldenFile {
  dataset: string;
  repoUrl: string;
  pinnedCommit: string;
  description?: string;
  queries: Array<{
    id: string;
    query: string;
    expectedPaths: string[];
  }>;
}

interface PerQueryRow {
  id: string;
  top1Ok: boolean;
  recallOk: boolean;
  firstGoldRank: number;
  top1Path: string;
  top1IsMarkdown: boolean;
}

interface PassResult {
  id: string;
  label: string;
  resolved: RankingWeightsConfig;
  top1Accuracy: number;
  recallAtK: number;
  accuracyScore: number;
  wrongTop1Count: number;
  missAtKCount: number;
  top1MarkdownCount: number;
  wrongTop1MarkdownCount: number;
  retrievalMeanMs: number;
  rows: PerQueryRow[];
}

const CACHE_SCHEMA = 2;

interface BenchmarkCache {
  schemaVersion: number;
  fingerprint: string;
  bundle: BenchmarkBundle;
  updatedAt?: string;
}

interface BenchmarkBundle {
  generatedAt: string;
  embeddingPackage: string;
  embeddingModelId: string;
  embeddingRuntime: EmbeddingRuntime;
  embeddingModelName: EmbeddingModelName;
  presetLabel: string;
  k: number;
  indexMs: number;
  goldenDataset: string;
  pinnedCommit: string;
  queryCount: number;
  passes: PassResult[];
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

function relPosix(rootDir: string, filepath: string): string {
  const abs = path.isAbsolute(filepath)
    ? filepath
    : path.join(rootDir, filepath);
  return path.relative(rootDir, abs).replace(/\\/g, "/");
}

function isMarkdownPath(relPath: string): boolean {
  return /\.md$/i.test(relPath);
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

function firstExpectedRank(
  rootDir: string,
  results: { filepath: string }[],
  expectedPaths: string[],
  k: number
): number {
  const top = results.slice(0, k);
  for (let i = 0; i < top.length; i++) {
    if (isExpectedFile(top[i].filepath, rootDir, expectedPaths)) {
      return i + 1;
    }
  }
  return 0;
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

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureRepo(workdir: string, golden: GoldenFile): Promise<string> {
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
      `git checkout ${golden.pinnedCommit} failed; try full clone`
    );
  }

  return repoRoot;
}

/** Always call before indexing so no stale vectors/chunks leak into scores. */
async function rmRaggrep(repoRoot: string): Promise<void> {
  const rag = path.join(repoRoot, ".raggrep");
  await fs.rm(rag, { recursive: true, force: true });
}

function buildEvalConfig(
  model: EmbeddingModelName,
  runtime: EmbeddingRuntime
): Config {
  const c = createDefaultConfig();
  c.extensions = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".mts",
    ".cts",
    ".md",
  ];
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
    {
      id: "docs/markdown",
      enabled: true,
      options: {
        embeddingModel: model,
        embeddingRuntime: runtime,
      },
    },
  ];
  return c;
}

function fingerprintMulti(
  golden: GoldenFile,
  k: number,
  model: string,
  runtime: string,
  passDescriptors: string,
  includeMarkdownModule: boolean
): string {
  return crypto
    .createHash("sha256")
    .update(
      `${CACHE_SCHEMA}\0${golden.pinnedCommit}\0${k}\0${model}\0${runtime}\0${includeMarkdownModule}\0${passDescriptors}\0${JSON.stringify(golden.queries)}`
    )
    .digest("hex")
    .slice(0, 32);
}

function safeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return cleaned.length > 0 ? cleaned : "benchmark";
}

function pct(x: number): string {
  return `${(100 * x).toFixed(1)}%`;
}

function escapeMdCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function fmtNum(x: number, d = 2): string {
  return x.toFixed(d);
}

async function loadCache(cachePath: string): Promise<BenchmarkCache | null> {
  try {
    const raw = await fs.readFile(cachePath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as BenchmarkCache).schemaVersion === CACHE_SCHEMA
    ) {
      return parsed as BenchmarkCache;
    }
  } catch {
    /* missing */
  }
  return null;
}

async function saveCache(cachePath: string, data: BenchmarkCache): Promise<void> {
  data.updatedAt = new Date().toISOString();
  const dir = path.dirname(cachePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${cachePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmp, cachePath);
}

async function runOnePass(
  repoRoot: string,
  golden: GoldenFile,
  k: number,
  pass: { id: string; label: string; partial?: RankingWeightsPartial }
): Promise<PassResult> {
  const resolved = mergeRankingWeights(pass.partial);
  const searchOpts: SearchOptions = {
    ensureFresh: false,
    topK: k,
    quiet: true,
    rankingWeights: pass.partial,
  };

  let wrongTop1Count = 0;
  let missAtKCount = 0;
  let retrievalTotalMs = 0;
  let top1MarkdownCount = 0;
  let wrongTop1MarkdownCount = 0;
  const rows: PerQueryRow[] = [];
  const n = golden.queries.length;

  for (const q of golden.queries) {
    const t0 = performance.now();
    const { results } = await hybridSearch(repoRoot, q.query, searchOpts);
    retrievalTotalMs += performance.now() - t0;

    const { wrongTop1, missAtK } = analyzeQuery(
      repoRoot,
      results,
      q.expectedPaths,
      k
    );
    if (wrongTop1) wrongTop1Count += 1;
    if (missAtK) missAtKCount += 1;

    const top1Path = results[0]
      ? relPosix(repoRoot, results[0].filepath)
      : "(no results)";
    const top1Md = results[0]
      ? isMarkdownPath(relPosix(repoRoot, results[0].filepath))
      : false;
    if (top1Md) top1MarkdownCount += 1;
    if (wrongTop1 && top1Md) wrongTop1MarkdownCount += 1;

    const firstGoldRank = firstExpectedRank(
      repoRoot,
      results,
      q.expectedPaths,
      k
    );

    rows.push({
      id: q.id,
      top1Ok: !wrongTop1,
      recallOk: !missAtK,
      firstGoldRank,
      top1Path,
      top1IsMarkdown: top1Md,
    });
  }

  const top1Accuracy = n > 0 ? (n - wrongTop1Count) / n : 0;
  const recallAtK = n > 0 ? (n - missAtKCount) / n : 0;
  const accuracyScore = (top1Accuracy + recallAtK) / 2;
  const retrievalMeanMs = n > 0 ? retrievalTotalMs / n : 0;

  return {
    id: pass.id,
    label: pass.label,
    resolved,
    top1Accuracy,
    recallAtK,
    accuracyScore,
    wrongTop1Count,
    missAtKCount,
    top1MarkdownCount,
    wrongTop1MarkdownCount,
    retrievalMeanMs,
    rows,
  };
}

function formatBenchmarkMarkdown(bundle: BenchmarkBundle, fp: string): string {
  const lines: string[] = [];
  lines.push(`# RAGgrep golden benchmark: weight sweep (next-convex)`);
  lines.push("");
  lines.push(`- **Generated:** ${bundle.generatedAt}`);
  lines.push(`- **Dataset:** ${bundle.goldenDataset}`);
  lines.push(`- **Pinned commit:** \`${bundle.pinnedCommit}\``);
  lines.push(`- **Preset:** ${bundle.presetLabel}`);
  lines.push(
    `- **Embedding library:** \`${bundle.embeddingPackage}\` (${bundle.embeddingRuntime})`
  );
  lines.push(`- **Embedding model name:** \`${bundle.embeddingModelName}\``);
  lines.push(`- **Embedding model id (Transformers):** \`${bundle.embeddingModelId}\``);
  lines.push(`- **Index modules:** core, language/typescript, docs/markdown`);
  lines.push(`- **k:** ${bundle.k}`);
  lines.push(`- **Fingerprint:** \`${fp}\``);
  lines.push(`- **Queries:** ${bundle.queryCount}`);
  lines.push(`- **Index time (ms):** ${bundle.indexMs.toFixed(0)}`);
  lines.push("");
  lines.push("## Weight sweep — comparison (primary)");
  lines.push("");
  lines.push(
    "Hypothesis: **heavy semantic weight lets prose-like chunks (often Markdown) score highly even when the query names concrete code symbols**; lowering `markdown.semantic` / raising `markdown.bm25` may reduce false `.md` top-1s."
  );
  lines.push("");
  lines.push(
    "| Pass | Label | ts.sem | ts.bm25 | ts.vocab | md.sem | md.bm25 | md.doc | lit.base | Top-1 | Recall@k | Score | wrong top-1 | wrong top-1 ∩ .md | top-1 is .md (#) | retrieval μ ms |"
  );
  lines.push(
    "|------|-------|-------:|--------:|---------:|-------:|--------:|-------:|---------:|------:|----------:|------:|------------:|-------------------:|-----------------:|---------------:|"
  );

  for (const p of bundle.passes) {
    const w = p.resolved;
    lines.push(
      "| " +
        [
          escapeMdCell(p.id),
          escapeMdCell(p.label),
          fmtNum(w.typescript.semantic),
          fmtNum(w.typescript.bm25),
          fmtNum(w.typescript.vocab),
          fmtNum(w.markdown.semantic),
          fmtNum(w.markdown.bm25),
          fmtNum(w.markdown.docIntentBoost),
          fmtNum(w.literal.baseScore),
          pct(p.top1Accuracy),
          pct(p.recallAtK),
          pct(p.accuracyScore),
          String(p.wrongTop1Count),
          String(p.wrongTop1MarkdownCount),
          String(p.top1MarkdownCount),
          p.retrievalMeanMs.toFixed(1),
        ].join(" | ") +
        " |"
    );
  }
  lines.push("");
  lines.push("### Diagnostic columns");
  lines.push("");
  lines.push(
    "- **wrong top-1 ∩ .md**: incorrect rank-1 where the predicted file is Markdown — proxy for “semantic prose won over code literals.”"
  );
  lines.push(
    "- **top-1 is .md (#)**: count of queries whose rank-1 is any `.md` file (correct or not)."
  );
  lines.push("");
  return lines.join("\n");
}

function formatPerQueryAppendix(pass: PassResult, k: number): string {
  const lines: string[] = [];
  lines.push(`## Per-query — ${escapeMdCell(pass.id)}: ${escapeMdCell(pass.label)}`);
  lines.push("");
  lines.push(
    "| Query id | Top-1 OK | Recall@k | First gold rank | Top-1 .md? | Top-1 file |"
  );
  lines.push(
    "|----------|----------|----------|-----------------|------------|------------|"
  );
  for (const row of pass.rows) {
    lines.push(
      `| ${escapeMdCell(row.id)} | ${row.top1Ok ? "yes" : "no"} | ${row.recallOk ? "yes" : "no"} | ${row.firstGoldRank || "—"} | ${row.top1IsMarkdown ? "yes" : "no"} | ${escapeMdCell(row.top1Path)} |`
    );
  }
  lines.push("");
  lines.push(`_Recall@${k} / first gold rank use the same k as the benchmark._`);
  lines.push("");
  return lines.join("\n");
}

async function runBenchmark(): Promise<void> {
  const workdir = parseArgString(
    "--workdir",
    path.join(process.env.TMPDIR || "/tmp", "raggrep-golden-convex-50")
  );
  const k = parseArg("--k", 10);
  const goldenPath = path.resolve(parseArgString("--golden", DEFAULT_GOLDEN));
  const benchmarkName = safeName(
    parseArgString("--benchmark-name", "raggrep-golden-convex-50")
  );
  const outDir = parseArgString(
    "--out-dir",
    path.join(SCRIPT_DIR, "benchmarks")
  );
  const useFast = parseArgFlag("--fast");
  const fresh = parseArgFlag("--fresh");
  const useCache = parseArgFlag("--cache");
  const perQuery = parseArgFlag("--per-query");
  const passCount = parseArg("--passes", WEIGHT_SWEEP.length);
  const weightsPath = process.argv.includes("--weights-json")
    ? parseArgString("--weights-json", "")
    : null;

  const preset = useFast ? PRESET_FAST : PRESET_QUALITY;
  const { label: presetLabel, model, runtime } = preset;
  const pkg = getEmbeddingPackage(runtime);
  const embeddingModelId = getEmbeddingModelId(model);

  const goldenRaw = await fs.readFile(goldenPath, "utf-8");
  const golden = JSON.parse(goldenRaw) as GoldenFile;

  let sweep = WEIGHT_SWEEP.slice(0, Math.min(passCount, WEIGHT_SWEEP.length));
  if (weightsPath) {
    const wraw = await fs.readFile(weightsPath, "utf-8");
    const partial = JSON.parse(wraw) as RankingWeightsPartial;
    sweep = [
      {
        id: "custom",
        label: `custom (${path.basename(weightsPath)})`,
        partial,
      },
    ];
  }

  const passDescriptors = sweep
    .map((s) => `${s.id}:${JSON.stringify(s.partial ?? null)}`)
    .join("|");
  const fp = fingerprintMulti(
    golden,
    k,
    model,
    runtime,
    passDescriptors,
    true
  );

  const outPath = path.join(outDir, `${benchmarkName}.result.md`);
  const cachePath = path.join(outDir, `${benchmarkName}.cache.json`);

  if (useCache && !fresh) {
    const cached = await loadCache(cachePath);
    if (cached && cached.fingerprint === fp) {
      console.log(`Cache hit (${cachePath}). Use --fresh to re-run.`);
      console.log(outPath);
      await fs.writeFile(
        outPath,
        formatBenchmarkMarkdown(cached.bundle, fp) +
          (perQuery
            ? "\n" +
              cached.bundle.passes.map((p) => formatPerQueryAppendix(p, k)).join("\n")
            : ""),
        "utf-8"
      );
      process.exit(0);
    }
  }

  const repoRoot = await ensureRepo(workdir, golden);
  await resetGlobalEmbeddingProvider();
  await rmRaggrep(repoRoot);
  await saveConfig(repoRoot, buildEvalConfig(model, runtime));

  const tIndex0 = performance.now();
  await indexDirectory(repoRoot, { quiet: true, model });
  const indexMs = performance.now() - tIndex0;

  const passes: PassResult[] = [];
  for (const spec of sweep) {
    const pr = await runOnePass(repoRoot, golden, k, spec);
    passes.push(pr);
    console.log(
      `${pr.id} ${pct(pr.accuracyScore)} top-1 ${pct(pr.top1Accuracy)} recall@${k} ${pct(pr.recallAtK)} wrong-md-top1 ${pr.wrongTop1MarkdownCount}`
    );
  }

  const bundle: BenchmarkBundle = {
    generatedAt: new Date().toISOString(),
    embeddingPackage: pkg,
    embeddingModelId,
    embeddingRuntime: runtime,
    embeddingModelName: model,
    presetLabel,
    k,
    indexMs,
    goldenDataset: golden.dataset,
    pinnedCommit: golden.pinnedCommit,
    queryCount: golden.queries.length,
    passes,
  };

  if (useCache) {
    await saveCache(cachePath, { schemaVersion: CACHE_SCHEMA, fingerprint: fp, bundle });
  }

  await fs.mkdir(outDir, { recursive: true });
  let md = formatBenchmarkMarkdown(bundle, fp);
  if (perQuery) {
    md += "\n" + passes.map((p) => formatPerQueryAppendix(p, k)).join("\n");
  }
  await fs.writeFile(outPath, md, "utf-8");

  console.log(outPath);
  await resetGlobalEmbeddingProvider();
  process.exit(0);
}

runBenchmark().catch((e) => {
  console.error(e);
  process.exit(1);
});
