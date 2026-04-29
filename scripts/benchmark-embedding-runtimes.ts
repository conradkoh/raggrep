#!/usr/bin/env bun
/**
 * Micro-benchmark: compare embedding throughput per {@link EmbeddingRuntime}.
 *
 * On some platforms (notably macOS with duplicate Sharp/libvips builds pulled in by
 * Transformers.js), the worker process may exit with SIGABRT (134) or SIGSEGV (139)
 * during native teardown even after a successful run. The parent treats those codes
 * as success when output contains the timing line.
 *
 * Usage:
 *   bun run bench:embeddings
 *   bun run scripts/benchmark-embedding-runtimes.ts --count 128 --warmup 4
 *
 * Internal (subprocess):
 *   bun run scripts/benchmark-embedding-runtimes.ts --_worker xenova --count 16 --warmup 1
 */

import type { EmbeddingRuntime } from "../src/domain/ports";

function parseArg(name: string, fallback: number): number {
  const i = process.argv.indexOf(name);
  if (i === -1 || !process.argv[i + 1]) return fallback;
  const n = parseInt(process.argv[i + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function makeTexts(count: number, length: number): string[] {
  const base =
    "export function authenticateUser(credentials: LoginCredentials): Promise<User> { ";
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`${base} // chunk ${i} `.padEnd(length, "x"));
  }
  return out;
}

async function runWorker(runtime: EmbeddingRuntime): Promise<void> {
  const count = parseArg("--count", 64);
  const warmup = parseArg("--warmup", 2);
  const textLen = parseArg("--text-len", 200);
  const texts = makeTexts(count, textLen);

  const {
    configureEmbeddings,
    getEmbeddings,
  } = await import("../src/infrastructure/embeddings/globalEmbeddings");

  configureEmbeddings({
    model: "bge-small-en-v1.5",
    runtime,
    showProgress: false,
  });

  for (let w = 0; w < warmup; w++) {
    await getEmbeddings(texts.slice(0, Math.min(texts.length, 8)));
  }

  const t0 = performance.now();
  const vecs = await getEmbeddings(texts);
  const ms = performance.now() - t0;

  const dim = vecs[0]?.length ?? 0;
  const perSec = (count / (ms / 1000)).toFixed(1);
  console.log(
    `${runtime.padEnd(12)}  ${ms.toFixed(0)}ms total  (~${perSec} vec/s)  dim=${dim}`
  );
}

async function spawnWorker(runtime: EmbeddingRuntime, count: number, warmup: number, textLen: number): Promise<number> {
  const proc = Bun.spawn({
    cmd: [
      "bun",
      "run",
      import.meta.path,
      "--_worker",
      runtime,
      "--count",
      String(count),
      "--warmup",
      String(warmup),
      "--text-len",
      String(textLen),
    ],
    stdout: "pipe",
    stderr: "inherit",
  });
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  process.stdout.write(out);
  const okLine = out.includes("vec/s");
  if (code === 0 || (okLine && (code === 134 || code === 139))) {
    return 0;
  }
  return code;
}

async function main() {
  const worker = process.argv.indexOf("--_worker");
  if (worker !== -1) {
    const rt = process.argv[worker + 1] as EmbeddingRuntime;
    if (rt !== "xenova" && rt !== "huggingface") {
      console.error("Invalid --_worker runtime");
      process.exit(1);
    }
    await runWorker(rt);
    return;
  }

  const count = parseArg("--count", 64);
  const warmup = parseArg("--warmup", 2);
  const textLen = parseArg("--text-len", 200);

  console.log(
    `Embedding micro-benchmark (subprocess per runtime): ${count} texts × ~${textLen} chars, warmup=${warmup}\n`
  );

  const runtimes: EmbeddingRuntime[] = ["xenova", "huggingface"];
  for (const rt of runtimes) {
    const code = await spawnWorker(rt, count, warmup, textLen);
    if (code !== 0) {
      console.error(`Benchmark subprocess failed for ${rt} (exit ${code})`);
      process.exit(code);
    }
  }
}

await main();
