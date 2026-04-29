#!/usr/bin/env bun
/**
 * Embedding harness: clone a reference repo, sample real source texts, then
 * benchmark every (runtime × model) combination **sequentially** (one subprocess
 * at a time) for clean timings.
 *
 * On macOS, Transformers.js teardown may exit 134/139 after a successful run; the
 * parent accepts that when a RESULT line was parsed from stdout.
 *
 * Usage:
 *   bun run bench:embeddings
 *   bun run scripts/benchmark-embedding-runtimes.ts --count 128 --warmup 4
 *   bun run scripts/benchmark-embedding-runtimes.ts --repo https://github.com/conradkoh/next-convex-starter-app.git
 *   bun run scripts/benchmark-embedding-runtimes.ts --commit 7518c373c3a72279252cb9eaef54c1a936f1bd0c
 *
 * Worker (internal):
 *   bun run scripts/benchmark-embedding-runtimes.ts --_worker xenova --model bge-small-en-v1.5 --texts-file /path/to/texts.json --warmup 2
 */

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { glob } from "glob";
import type {
  EmbeddingModelName,
  EmbeddingRuntime,
} from "../src/domain/ports";

/** Self path for respawning this script as a worker (portable; avoids Bun-only `import.meta.path`). */
const SCRIPT_FILE = fileURLToPath(import.meta.url);

const DEFAULT_REPO_URL =
  "https://github.com/conradkoh/next-convex-starter-app.git";

/** Pinned tree for reproducible harness runs (matches scripts/eval/golden-queries-next-convex.json). */
const DEFAULT_REPO_COMMIT =
  "7518c373c3a72279252cb9eaef54c1a936f1bd0c";

const RUNTIMES: EmbeddingRuntime[] = ["xenova", "huggingface"];

const MODELS: EmbeddingModelName[] = [
  "all-MiniLM-L6-v2",
  "all-MiniLM-L12-v2",
  "bge-small-en-v1.5",
  "paraphrase-MiniLM-L3-v2",
  "nomic-embed-text-v1.5",
];

export interface BenchMetric {
  runtime: EmbeddingRuntime;
  model: EmbeddingModelName;
  count: number;
  ms: number;
  dim: number;
  vecPerSec: number;
  exitCode: number;
  repoUrl: string;
  /** Git commit checked out under clonePath (reproducible corpus). */
  repoCommit?: string;
  clonePath: string;
  textsPath: string;
  warmup: number;
  timestampIso: string;
  error?: string;
}

function parseArg(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  if (i === -1 || !process.argv[i + 1]) return fallback;
  const n = parseInt(process.argv[i + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Like {@link parseArg} but allows zero (e.g. `--warmup 0`). */
function parseArgNonNegative(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  if (i === -1 || !process.argv[i + 1]) return fallback;
  const n = parseInt(process.argv[i + 1], 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseArgString(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  if (i === -1 || !process.argv[i + 1]) return fallback;
  return process.argv[i + 1];
}

function parseArgFlag(name: string): boolean {
  return process.argv.includes(name);
}

/** Cartesian product: runtime × model (explicit harness matrix). */
function buildHarnessCombinations(): Array<{
  runtime: EmbeddingRuntime;
  model: EmbeddingModelName;
}> {
  const out: Array<{ runtime: EmbeddingRuntime; model: EmbeddingModelName }> =
    [];
  for (const runtime of RUNTIMES) {
    for (const model of MODELS) {
      out.push({ runtime, model });
    }
  }
  return out;
}

async function cloneRepo(repoUrl: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  const proc = Bun.spawn({
    cmd: [
      "git",
      "clone",
      "--depth",
      "1",
      "--single-branch",
      repoUrl,
      destDir,
    ],
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`git clone failed with exit ${code}: ${repoUrl}`);
  }
}

async function checkoutCommit(repoRoot: string, commit: string): Promise<void> {
  const proc = Bun.spawn({
    cmd: ["git", "-C", repoRoot, "checkout", "--force", commit],
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(
      `git checkout ${commit} failed (exit ${code}). Try a full clone without --depth 1 if the commit is not on the default branch tip.`
    );
  }
}

/**
 * Sample up to `count` text chunks from a repo (real files, skipped build dirs).
 */
async function collectTextsFromRepo(
  repoRoot: string,
  count: number,
  maxChunkChars: number
): Promise<string[]> {
  const patterns = ["**/*.{ts,tsx,js,jsx,mjs,cjs,md,json}", "**/*.{py,go,rs}"];
  const ignore = [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/coverage/**",
  ];

  const files = new Set<string>();
  for (const p of patterns) {
    const hits = await glob(p, {
      cwd: repoRoot,
      nodir: true,
      absolute: true,
      ignore,
    });
    for (const f of hits) {
      files.add(f);
      if (files.size >= 800) break;
    }
    if (files.size >= 800) break;
  }

  const texts: string[] = [];
  const fileList = [...files];
  let fi = 0;
  while (texts.length < count && fileList.length > 0) {
    const fp = fileList[fi % fileList.length];
    fi++;
    try {
      const raw = await fs.readFile(fp, "utf-8");
      if (!raw.trim()) continue;
      const slice = raw.slice(0, maxChunkChars);
      texts.push(slice);
    } catch {
      // skip unreadable
    }
  }

  if (texts.length === 0) {
    throw new Error(`No sample texts collected under ${repoRoot}`);
  }

  while (texts.length < count) {
    texts.push(texts[texts.length % texts.length]);
  }

  return texts.slice(0, count);
}

function parseResultLine(stdout: string): Partial<BenchMetric> | null {
  for (const line of stdout.split("\n")) {
    const m = line.match(/^RESULT\s+(.+)$/);
    if (m) {
      try {
        return JSON.parse(m[1]) as Partial<BenchMetric>;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function subprocessSuccess(code: number, parsed: Partial<BenchMetric> | null): boolean {
  if (code === 0) return true;
  if (parsed?.ms != null && parsed.dim != null && parsed.vecPerSec != null) {
    return code === 134 || code === 139;
  }
  return false;
}

async function spawnWorker(
  runtime: EmbeddingRuntime,
  model: EmbeddingModelName,
  textsPath: string,
  warmup: number
): Promise<{ code: number; stdout: string; metric: BenchMetric | null }> {
  const proc = Bun.spawn({
    cmd: [
      "bun",
      "run",
      SCRIPT_FILE,
      "--_worker",
      runtime,
      "--model",
      model,
      "--texts-file",
      textsPath,
      "--warmup",
      String(warmup),
    ],
    stdout: "pipe",
    stderr: "inherit",
  });
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  const partial = parseResultLine(stdout);
  let metric: BenchMetric | null = null;
  if (
    partial &&
    typeof partial.ms === "number" &&
    typeof partial.dim === "number" &&
    typeof partial.vecPerSec === "number" &&
    typeof partial.count === "number"
  ) {
    metric = {
      runtime,
      model,
      count: partial.count,
      ms: partial.ms,
      dim: partial.dim,
      vecPerSec: partial.vecPerSec,
      exitCode: code,
      repoUrl: partial.repoUrl ?? "",
      clonePath: partial.clonePath ?? "",
      textsPath: partial.textsPath ?? textsPath,
      warmup,
      timestampIso: new Date().toISOString(),
    };
  }
  return { code, stdout, metric };
}

async function runWorker(): Promise<void> {
  const workerIdx = process.argv.indexOf("--_worker");
  const runtime = process.argv[workerIdx + 1] as EmbeddingRuntime;
  const modelIdx = process.argv.indexOf("--model");
  const model = process.argv[modelIdx + 1] as EmbeddingModelName;
  const tfIdx = process.argv.indexOf("--texts-file");
  const textsPath = process.argv[tfIdx + 1];
  const warmup = parseArgNonNegative("--warmup", 2);

  if (runtime !== "xenova" && runtime !== "huggingface") {
    console.error("Invalid --_worker runtime");
    process.exit(1);
  }
  if (!model || !textsPath) {
    console.error("Missing --model or --texts-file");
    process.exit(1);
  }

  const texts: string[] = JSON.parse(await Bun.file(textsPath).text());
  const count = texts.length;

  const {
    configureEmbeddings,
    getEmbeddings,
  } = await import("../src/infrastructure/embeddings/globalEmbeddings");

  configureEmbeddings({
    model,
    runtime,
    showProgress: false,
  });

  const warmN = Math.min(texts.length, 8);
  for (let w = 0; w < warmup; w++) {
    await getEmbeddings(texts.slice(0, warmN));
  }

  const t0 = performance.now();
  const vecs = await getEmbeddings(texts);
  const ms = performance.now() - t0;

  const dim = vecs[0]?.length ?? 0;
  const vecPerSec = count / (ms / 1000);

  const payload: Partial<BenchMetric> = {
    runtime,
    model,
    count,
    ms,
    dim,
    vecPerSec,
    textsPath,
  };

  process.stdout.write(
    `${String(runtime).padEnd(12)}  ${String(model).padEnd(28)}  ${ms.toFixed(0)}ms  (~${vecPerSec.toFixed(1)} vec/s)  dim=${dim}\n`
  );
  process.stdout.write(`RESULT ${JSON.stringify(payload)}\n`);
}

async function main() {
  if (process.argv.includes("--_worker")) {
    await runWorker();
    return;
  }

  const count = parseArg("--count", 64);
  const warmup = parseArgNonNegative("--warmup", 2);
  const maxChunkChars = parseArg("--text-len", 2000);
  const repoUrl = parseArgString("--repo", DEFAULT_REPO_URL);
  const repoCommit = parseArgString("--commit", DEFAULT_REPO_COMMIT);
  const keepClone = parseArgFlag("--keep-clone");

  const workRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "raggrep-embed-bench-")
  );
  const clonePath = path.join(workRoot, "repo");
  const textsPath = path.join(workRoot, "texts.json");

  console.log(`Work directory: ${workRoot}`);
  console.log(`Cloning: ${repoUrl}`);
  await cloneRepo(repoUrl, clonePath);
  console.log(`Checking out pinned commit: ${repoCommit}`);
  await checkoutCommit(clonePath, repoCommit);

  console.log(
    `Collecting ${count} text samples (max ${maxChunkChars} chars each)…`
  );
  const texts = await collectTextsFromRepo(clonePath, count, maxChunkChars);
  await Bun.write(textsPath, JSON.stringify(texts));

  const combinations = buildHarnessCombinations();
  console.log(
    `\nRunning ${combinations.length} combinations sequentially (runtime × model)…\n`
  );

  const results: BenchMetric[] = [];
  let i = 0;
  for (const { runtime, model } of combinations) {
    i += 1;
    console.log(`[${i}/${combinations.length}] ${runtime} + ${model}`);
    const { code, stdout, metric } = await spawnWorker(
      runtime,
      model,
      textsPath,
      warmup
    );
    process.stdout.write(stdout);
    if (metric) {
      const full: BenchMetric = {
        ...metric,
        exitCode: code,
        repoUrl,
        repoCommit,
        clonePath,
        warmup,
        timestampIso: new Date().toISOString(),
      };
      results.push(full);
      console.log(`METRIC ${JSON.stringify(full)}`);
    } else if (!subprocessSuccess(code, metric)) {
      console.error(`Subprocess failed (exit ${code}) for ${runtime} ${model}`);
      if (!keepClone) {
        await fs.rm(workRoot, { recursive: true, force: true });
      }
      process.exit(code);
    } else {
      console.warn(`No RESULT line parsed; exit ${code}`);
    }
  }

  console.log("\n--- Summary (JSON) ---\n");
  console.log(JSON.stringify(results, null, 2));

  if (!keepClone) {
    await fs.rm(workRoot, { recursive: true, force: true });
    console.log(`\nRemoved temp dir: ${workRoot}`);
  } else {
    console.log(`\nKept temp dir (--keep-clone): ${workRoot}`);
  }
}

await main();
