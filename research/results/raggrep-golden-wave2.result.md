# RAGgrep golden benchmark: weight sweep (next-convex)

- **Generated:** 2026-04-30T02:56:51.111Z
- **Dataset:** next-convex-starter-app
- **Pinned commit:** `7518c373c3a72279252cb9eaef54c1a936f1bd0c`
- **Preset:** Quality (bge-small-en-v1.5)
- **Embedding library:** `@huggingface/transformers` (huggingface)
- **Embedding model name:** `bge-small-en-v1.5`
- **Embedding model id (Transformers):** `Xenova/bge-small-en-v1.5`
- **Index modules:** core, language/typescript, docs/markdown
- **k:** 10
- **Fingerprint:** `89565e95c9e634bcd40ed475d06a7c99`
- **Queries:** 50
- **Index time (ms):** 45897

## Weight sweep — comparison (primary)

Hypothesis: **heavy semantic weight lets prose-like chunks (often Markdown) score highly even when the query names concrete code symbols**; lowering `markdown.semantic` / raising `markdown.bm25` may reduce false `.md` top-1s.

| Pass | Label | ts.sem | ts.bm25 | ts.vocab | md.sem | md.bm25 | md.doc | lit.base | Top-1 | Recall@k | Score | wrong top-1 | wrong top-1 ∩ .md | top-1 is .md (#) | retrieval μ ms |
|------|-------|-------:|--------:|---------:|-------:|--------:|-------:|---------:|------:|----------:|------:|------------:|-------------------:|-----------------:|---------------:|
| p0 | baseline (defaults) | 0.45 | 0.40 | 0.15 | 0.70 | 0.30 | 0.05 | 0.50 | 64.0% | 88.0% | 76.0% | 18 | 9 | 9 | 191.6 |
| p1 | ts 0.40 / 0.45 / 0.15 (more BM25) | 0.40 | 0.45 | 0.15 | 0.70 | 0.30 | 0.05 | 0.50 | 62.0% | 88.0% | 75.0% | 19 | 8 | 8 | 190.6 |
| p2 | ts 0.48 / 0.37 / 0.15 (more semantic) | 0.48 | 0.37 | 0.15 | 0.70 | 0.30 | 0.05 | 0.50 | 62.0% | 88.0% | 75.0% | 19 | 12 | 12 | 190.3 |
| p3 | ts 0.38 / 0.47 / 0.15 (max BM25) | 0.38 | 0.47 | 0.15 | 0.70 | 0.30 | 0.05 | 0.50 | 62.0% | 88.0% | 75.0% | 19 | 8 | 8 | 191.8 |
| p4 | ts 0.43 / 0.42 / 0.15 (balanced) | 0.43 | 0.42 | 0.15 | 0.70 | 0.30 | 0.05 | 0.50 | 64.0% | 88.0% | 76.0% | 18 | 9 | 9 | 190.3 |
| p5 | md 0.65 / 0.35 (gentle sem↓) | 0.45 | 0.40 | 0.15 | 0.65 | 0.35 | 0.05 | 0.50 | 62.0% | 88.0% | 75.0% | 19 | 12 | 12 | 191.1 |
| p6 | md 0.58 / 0.42 | 0.45 | 0.40 | 0.15 | 0.58 | 0.42 | 0.05 | 0.50 | 62.0% | 86.0% | 74.0% | 19 | 12 | 12 | 190.6 |
| p7 | ts vocab↑ 0.42 / 0.40 / 0.18 | 0.42 | 0.40 | 0.18 | 0.70 | 0.30 | 0.05 | 0.50 | 62.0% | 86.0% | 74.0% | 19 | 12 | 12 | 190.4 |
| p8 | discriminative boostCap 0.12 | 0.45 | 0.40 | 0.15 | 0.70 | 0.30 | 0.05 | 0.50 | 62.0% | 88.0% | 75.0% | 19 | 10 | 10 | 192.1 |
| p9 | combo ts 0.43/0.42 + md 0.62/0.33 doc 0.03 | 0.43 | 0.42 | 0.15 | 0.62 | 0.33 | 0.03 | 0.50 | 64.0% | 90.0% | 77.0% | 18 | 7 | 7 | 190.5 |

### Diagnostic columns

- **wrong top-1 ∩ .md**: incorrect rank-1 where the predicted file is Markdown — proxy for “semantic prose won over code literals.”
- **top-1 is .md (#)**: count of queries whose rank-1 is any `.md` file (correct or not).
