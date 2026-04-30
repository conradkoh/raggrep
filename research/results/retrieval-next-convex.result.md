# Retrieval benchmark: retrieval-next-convex

- **Generated:** 2026-04-29T17:00:32.909Z
- **Dataset:** next-convex-starter-app
- **Repo:** https://github.com/conradkoh/next-convex-starter-app.git
- **Pinned commit:** `7518c373c3a72279252cb9eaef54c1a936f1bd0c`
- **Workdir:** `/var/folders/7f/nbv9mwr52xv9dmfj1q2bgr0h0000gn/T/raggrep-retrieval-eval`
- **Quality @k:** top-10 chunks vs golden paths
- **Mode:** `--compare-two`: fast vs quality on `huggingface` only (in-process)
- **Combinations:** 2
- **Cache:** `retrieval-next-convex.cache.json` (skip cells when fingerprint matches; `--fresh` clears)

## By model and runtime

Rows are **Fast** then **Quality** (not re-sorted), both using `huggingface` runtime.

| Preset | Runtime | Model | Index (ms) | Retrieval total (ms) | Retrieval mean (ms) | Top-1 acc | Recall@k | **Score** |
|--------|---------|-------|-------------:|----------------------:|--------------------:|----------:|---------:|----------:|
| Fast (paraphrase-MiniLM-L3-v2) | huggingface | paraphrase-MiniLM-L3-v2 | 5929 | 866.7 | 86.7 | 50.0% | 100.0% | **75.0%** |
| Quality (bge-small-en-v1.5) | huggingface | bge-small-en-v1.5 | 18164 | 886.5 | 88.6 | 70.0% | 100.0% | **85.0%** |

### Metric definitions

- **Index (ms):** full `indexDirectory` pass for that runtime + model (cold `.raggrep`).
- **Retrieval total / mean:** sum and average of per-query `hybridSearch` time (sequential queries, `ensureFresh: false`).
- **Top-1 acc:** share of queries whose top-ranked chunk is from a golden-labeled file.
- **Recall@k:** share of queries where at least one golden file appears in the top-k chunks.
- **Score:** average of Top-1 acc and Recall@k (single balanced accuracy number, 0–100%).
