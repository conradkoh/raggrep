#!/usr/bin/env bun
/**
 * Golden-query **coordinate hill-climb** on {@link SearchOptions.rankingWeights} with
 * **one index** and repeated search-only evals. Shrinks the step when the current grid
 * plateaus, until `minStep` — a **local maximum** of the combined score
 * (Top-1 + Recall@k) / 2 for the default golden set.
 *
 * Tunable axes (neighbors at ±step):
 * - TypeScript: `semantic` / `bm25` with fixed `vocab` (renormalize sem+bm25 to sum with vocab)
 * - Markdown: `semantic` / `bm25` with fixed sum (slide along sem+bm25)
 * - Markdown: `docIntentBoost`
 * - Discriminative: `boostCap`
 *
 * Each **evaluation** runs the **full golden set** (50 queries by default). Tune `--max-evals`
 * (total eval calls) for cost vs thoroughness.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import type { EmbeddingModelName, EmbeddingRuntime } from "../src/domain/ports";
import type {
  RankingWeightsConfig,
  RankingWeightsPartial,
  SearchOptions,
} from "../src/domain/entities";
import {
  createDefaultConfig,
  DEFAULT_RANKING_WEIGHTS,
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

function embeddingPkg(runtime: EmbeddingRuntime): string {
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

interface EvalMetrics {
  accuracyScore: number;
  top1Accuracy: number;
  recallAtK: number;
  wrongTop1MarkdownCount: number;
  wrongTop1Count: number;
}

function parseArg(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  if (i === -1 || !process.argv[i + 1]) return fallback;
  const n = parseFloat(process.argv[i + 1]);
  return Number.isFinite(n) ? n : fallback;
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
    if (code !== 0) throw new Error(`git clone failed with exit ${code}`);
  }

  const co = Bun.spawn({
    cmd: ["git", "-C", repoRoot, "checkout", "--force", golden.pinnedCommit],
    stdout: "inherit",
    stderr: "inherit",
  });
  const checkoutExit = await co.exited;
  if (checkoutExit !== 0) {
    throw new Error(`git checkout ${golden.pinnedCommit} failed`);
  }

  return repoRoot;
}

async function rmRaggrep(repoRoot: string): Promise<void> {
  await fs.rm(path.join(repoRoot, ".raggrep"), { recursive: true, force: true });
}

function buildEvalConfig(model: EmbeddingModelName, runtime: EmbeddingRuntime): Config {
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
      options: { embeddingModel: model, embeddingRuntime: runtime },
    },
    {
      id: "docs/markdown",
      enabled: true,
      options: { embeddingModel: model, embeddingRuntime: runtime },
    },
  ];
  return c;
}

function literalEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Partial overrides relative to {@link DEFAULT_RANKING_WEIGHTS} for hybridSearch. */
function rankingConfigToPartial(r: RankingWeightsConfig): RankingWeightsPartial {
  const d = DEFAULT_RANKING_WEIGHTS;
  const p: RankingWeightsPartial = {};
  if (
    r.discriminative.boostCap !== d.discriminative.boostCap ||
    r.discriminative.penaltyMax !== d.discriminative.penaltyMax ||
    r.discriminative.penaltyFloor !== d.discriminative.penaltyFloor
  ) {
    p.discriminative = { ...r.discriminative };
  }
  if (
    r.typescript.semantic !== d.typescript.semantic ||
    r.typescript.bm25 !== d.typescript.bm25 ||
    r.typescript.vocab !== d.typescript.vocab ||
    r.typescript.vocabBypassThreshold !== d.typescript.vocabBypassThreshold
  ) {
    p.typescript = { ...r.typescript };
  }
  if (
    r.language.semantic !== d.language.semantic ||
    r.language.bm25 !== d.language.bm25
  ) {
    p.language = { ...r.language };
  }
  if (
    r.markdown.semantic !== d.markdown.semantic ||
    r.markdown.bm25 !== d.markdown.bm25 ||
    r.markdown.docIntentBoost !== d.markdown.docIntentBoost ||
    r.markdown.headingPhraseCoverageMin !== d.markdown.headingPhraseCoverageMin ||
    r.markdown.headingPhraseCoverageSpan !== d.markdown.headingPhraseCoverageSpan
  ) {
    p.markdown = { ...r.markdown };
  }
  if (
    r.json.bm25 !== d.json.bm25 ||
    r.json.literalBaseWeight !== d.json.literalBaseWeight
  ) {
    p.json = { ...r.json };
  }
  if (!literalEqual(r.literal, d.literal)) {
    p.literal = r.literal;
  }
  return p;
}

function roundKey(r: RankingWeightsConfig): string {
  const q = (x: number) => Math.round(x * 1e4) / 1e4;
  return JSON.stringify({
    ts: [
      q(r.typescript.semantic),
      q(r.typescript.bm25),
      q(r.typescript.vocab),
    ],
    md: [
      q(r.markdown.semantic),
      q(r.markdown.bm25),
      q(r.markdown.docIntentBoost),
    ],
    disc: q(r.discriminative.boostCap),
  });
}

/** Axis-aligned neighbors for coordinate ascent. */
function neighborsFromResolved(
  R: RankingWeightsConfig,
  step: number
): RankingWeightsConfig[] {
  const out: RankingWeightsConfig[] = [];
  const v = R.typescript.vocab;

  const pushTs = (semantic: number) => {
    const bm25 = 1 - v - semantic;
    if (semantic < 0.22 || semantic > 0.72 || bm25 < 0.12 || bm25 > 0.72) return;
    out.push({
      ...R,
      typescript: { ...R.typescript, semantic, bm25 },
    });
  };
  for (const delta of [step, -step]) {
    pushTs(R.typescript.semantic + delta);
  }

  const sumMd = R.markdown.semantic + R.markdown.bm25;
  const pushMd = (semantic: number) => {
    const bm25 = sumMd - semantic;
    if (semantic < 0.38 || semantic > 0.82 || bm25 < 0.12 || bm25 > 0.62) return;
    out.push({
      ...R,
      markdown: { ...R.markdown, semantic, bm25 },
    });
  };
  for (const delta of [step, -step]) {
    pushMd(R.markdown.semantic + delta);
  }

  for (const delta of [step, -step]) {
    const doc = R.markdown.docIntentBoost + delta;
    if (doc < 0 || doc > 0.12) continue;
    out.push({
      ...R,
      markdown: { ...R.markdown, docIntentBoost: doc },
    });
  }

  for (const delta of [step, -step]) {
    const bc = R.discriminative.boostCap + delta;
    if (bc < 0.04 || bc > 0.22) continue;
    out.push({
      ...R,
      discriminative: { ...R.discriminative, boostCap: bc },
    });
  }

  const seen = new Set<string>();
  const uniq: RankingWeightsConfig[] = [];
  for (const c of out) {
    const k = roundKey(c);
    if (!seen.has(k)) {
      seen.add(k);
      uniq.push(c);
    }
  }
  return uniq;
}

async function evaluateResolved(
  repoRoot: string,
  golden: GoldenFile,
  k: number,
  resolved: RankingWeightsConfig
): Promise<EvalMetrics> {
  const partial = rankingConfigToPartial(resolved);
  const searchOpts: SearchOptions = {
    ensureFresh: false,
    topK: k,
    quiet: true,
    rankingWeights:
      Object.keys(partial).length > 0 ? partial : undefined,
  };

  let wrongTop1Count = 0;
  let missAtKCount = 0;
  let wrongTop1MarkdownCount = 0;
  const n = golden.queries.length;

  for (const q of golden.queries) {
    const { results } = await hybridSearch(repoRoot, q.query, searchOpts);
    const { wrongTop1, missAtK } = analyzeQuery(
      repoRoot,
      results,
      q.expectedPaths,
      k
    );
    if (wrongTop1) wrongTop1Count += 1;
    if (missAtK) missAtKCount += 1;
    if (
      wrongTop1 &&
      results[0] &&
      isMarkdownPath(relPosix(repoRoot, results[0].filepath))
    ) {
      wrongTop1MarkdownCount += 1;
    }
  }

  const top1Accuracy = n > 0 ? (n - wrongTop1Count) / n : 0;
  const recallAtK = n > 0 ? (n - missAtKCount) / n : 0;
  const accuracyScore = (top1Accuracy + recallAtK) / 2;
  return {
    accuracyScore,
    top1Accuracy,
    recallAtK,
    wrongTop1MarkdownCount,
    wrongTop1Count,
  };
}

async function main(): Promise<void> {
  const workdir = parseArgString(
    "--workdir",
    path.join(process.env.TMPDIR || "/tmp", "raggrep-golden-hillclimb")
  );
  const k = parseInt(String(parseArg("--k", 10)), 10);
  const goldenPath = path.resolve(parseArgString("--golden", DEFAULT_GOLDEN));
  const outDir = parseArgString(
    "--out-dir",
    path.join(SCRIPT_DIR, "benchmarks")
  );
  const benchmarkName = parseArgString(
    "--benchmark-name",
    "raggrep-golden-hillclimb"
  );
  const useFast = parseArgFlag("--fast");
  let step = parseArg("--step", 0.02);
  const minStep = parseArg("--min-step", 0.005);
  const maxEvals = Math.floor(parseArg("--max-evals", 250));

  const preset = useFast ? PRESET_FAST : PRESET_QUALITY;
  const { label: presetLabel, model, runtime } = preset;

  const goldenRaw = await fs.readFile(goldenPath, "utf-8");
  const golden = JSON.parse(goldenRaw) as GoldenFile;

  const repoRoot = await ensureRepo(workdir, golden);
  await resetGlobalEmbeddingProvider();
  await rmRaggrep(repoRoot);
  await saveConfig(repoRoot, buildEvalConfig(model, runtime));

  const t0 = performance.now();
  await indexDirectory(repoRoot, { quiet: true, model });
  const indexMs = performance.now() - t0;

  console.log(
    `Indexed in ${indexMs.toFixed(0)} ms. Hill-climb: each eval = ${golden.queries.length} queries (cap ${maxEvals} evals).`
  );

  let bestR = mergeRankingWeights(undefined);
  let bestMetrics = await evaluateResolved(repoRoot, golden, k, bestR);
  let evalCount = 1;

  const lines: string[] = [];
  lines.push("# RAGgrep golden hill-climb (local maximum search)");
  lines.push("");
  lines.push(`- **Preset:** ${presetLabel}`);
  lines.push(`- **Embedding:** ${embeddingPkg(runtime)} / \`${model}\` (\`${getEmbeddingModelId(model)}\`)`);
  lines.push(`- **k:** ${k}`);
  lines.push(`- **Index (ms):** ${indexMs.toFixed(0)}`);
  lines.push(`- **Objective:** maximize combined score = (Top-1 + Recall@k) / 2`);
  lines.push(`- **Initial step:** ${step}, **min step:** ${minStep}`);
  lines.push(
    `- **Axes:** TS sem/bm25 (vocab fixed), MD sem/bm25 (constant sum), docIntent, discriminative.boostCap`
  );
  lines.push("");

  lines.push("## Trace");
  lines.push("");
  lines.push(
    "| Phase | Step | Score | Top-1 | Recall | wrong top-1 | wrong∩.md | ts.sem | ts.bm25 | md.sem | md.bm25 | md.doc | disc.cap |"
  );
  lines.push(
    "|-------|-----:|------:|------:|-------:|------------:|----------:|-------:|--------:|-------:|--------:|-------:|---------:|"
  );

  const pushRow = (phase: string, st: number, m: EvalMetrics, R: RankingWeightsConfig) => {
    lines.push(
      "| " +
        [
          phase,
          st.toFixed(4),
          `${(100 * m.accuracyScore).toFixed(2)}%`,
          `${(100 * m.top1Accuracy).toFixed(1)}%`,
          `${(100 * m.recallAtK).toFixed(1)}%`,
          String(m.wrongTop1Count),
          String(m.wrongTop1MarkdownCount),
          R.typescript.semantic.toFixed(3),
          R.typescript.bm25.toFixed(3),
          R.markdown.semantic.toFixed(3),
          R.markdown.bm25.toFixed(3),
          R.markdown.docIntentBoost.toFixed(3),
          R.discriminative.boostCap.toFixed(3),
        ].join(" | ") +
        " |"
    );
  };

  pushRow("start", step, bestMetrics, bestR);

  for (;;) {
    if (evalCount >= maxEvals) {
      lines.push("");
      lines.push(`Stopped: **--max-evals** (${maxEvals})`);
      break;
    }

    let inner = 0;
    while (inner < 200) {
      inner += 1;
      if (evalCount >= maxEvals) break;

      const neigh = neighborsFromResolved(bestR, step);
      if (neigh.length === 0) {
        lines.push("");
        lines.push("_No valid neighbors at this step (clamps)._");
        break;
      }
      if (evalCount + neigh.length > maxEvals) {
        lines.push("");
        lines.push(
          `Stopped: **--max-evals** — need ${neigh.length} consecutive evals for one neighbor scan (${evalCount}/${maxEvals} used)`
        );
        evalCount = maxEvals;
        break;
      }

      let pick: RankingWeightsConfig | null = null;
      let pickScore = bestMetrics.accuracyScore;
      let pickM = bestMetrics;

      for (const n of neigh) {
        if (evalCount >= maxEvals) break;
        const m = await evaluateResolved(repoRoot, golden, k, n);
        evalCount += 1;
        if (m.accuracyScore > pickScore + 1e-10) {
          pickScore = m.accuracyScore;
          pick = n;
          pickM = m;
        }
      }

      if (pick && pickScore > bestMetrics.accuracyScore + 1e-10) {
        bestR = pick;
        bestMetrics = pickM;
        pushRow(`climb @${step.toFixed(4)} #${inner}`, step, bestMetrics, bestR);
      } else {
        break;
      }
    }

    if (evalCount >= maxEvals) break;

    lines.push("");
    lines.push(`_No improving neighbor at step ${step.toFixed(4)} — shrink grid or stop_`);
    if (step <= minStep + 1e-12) break;
    const next = step / 2;
    step = next < minStep ? minStep : next;
  }

  lines.push("");
  lines.push("## Local maximum (best found)");
  lines.push("");
  lines.push(`- **Combined score:** ${(100 * bestMetrics.accuracyScore).toFixed(2)}%`);
  lines.push(`- **Top-1:** ${(100 * bestMetrics.top1Accuracy).toFixed(1)}%`);
  lines.push(`- **Recall@k:** ${(100 * bestMetrics.recallAtK).toFixed(1)}%`);
  lines.push(`- **Evaluations:** ${evalCount}`);
  lines.push("");
  lines.push("Resolved weights (merge onto `DEFAULT_RANKING_WEIGHTS` via partial):");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(rankingConfigToPartial(bestR), null, 2));
  lines.push("```");
  lines.push("");
  lines.push(
    `_Stopping rule: at each grid step, greedy ascent over all axis neighbors; shrink step until \`step ≤ minStep\`. Caps early if \`--max-evals\` would truncate a neighbor scan._`
  );

  const outPath = path.join(outDir, `${benchmarkName.replace(/[^a-zA-Z0-9._-]/g, "-")}.result.md`);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outPath, lines.join("\n"), "utf-8");

  console.log(outPath);
  console.log(
    `Best score ${(100 * bestMetrics.accuracyScore).toFixed(2)}% | evals ${evalCount} | ${path.basename(outPath)}`
  );

  await resetGlobalEmbeddingProvider();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
