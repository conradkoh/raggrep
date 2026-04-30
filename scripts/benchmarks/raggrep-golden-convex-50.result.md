# RAGgrep golden benchmark: weight sweep (next-convex)

- **Generated:** 2026-04-30T02:49:45.043Z
- **Dataset:** next-convex-starter-app
- **Pinned commit:** `7518c373c3a72279252cb9eaef54c1a936f1bd0c`
- **Preset:** Quality (bge-small-en-v1.5)
- **Embedding library:** `@huggingface/transformers` (huggingface)
- **Embedding model name:** `bge-small-en-v1.5`
- **Embedding model id (Transformers):** `Xenova/bge-small-en-v1.5`
- **Index modules:** core, language/typescript, docs/markdown
- **k:** 10
- **Fingerprint:** `fa1bb90e1301f2af2b056412c057b83a`
- **Queries:** 50
- **Index time (ms):** 45087

## Weight sweep — comparison (primary)

Hypothesis: **heavy semantic weight lets prose-like chunks (often Markdown) score highly even when the query names concrete code symbols**; lowering `markdown.semantic` / raising `markdown.bm25` may reduce false `.md` top-1s.

| Pass | Label | ts.sem | ts.bm25 | ts.vocab | md.sem | md.bm25 | md.doc | lit.base | Top-1 | Recall@k | Score | wrong top-1 | wrong top-1 ∩ .md | top-1 is .md (#) | retrieval μ ms |
|------|-------|-------:|--------:|---------:|-------:|--------:|-------:|---------:|------:|----------:|------:|------------:|-------------------:|-----------------:|---------------:|
| p0 | baseline (defaults) | 0.60 | 0.25 | 0.15 | 0.70 | 0.30 | 0.05 | 0.50 | 62.0% | 90.0% | 76.0% | 19 | 12 | 12 | 192.3 |
| p1 | md semantic↓ bm25↑ (0.55 / 0.45) | 0.60 | 0.25 | 0.15 | 0.55 | 0.45 | 0.05 | 0.50 | 60.0% | 84.0% | 72.0% | 20 | 14 | 14 | 191.6 |
| p2 | md semantic↓ bm25↑ (0.45 / 0.55) | 0.60 | 0.25 | 0.15 | 0.45 | 0.55 | 0.05 | 0.50 | 58.0% | 82.0% | 70.0% | 21 | 15 | 15 | 191.0 |
| p3 | md semantic↓ bm25↑ (0.35 / 0.65) | 0.60 | 0.25 | 0.15 | 0.35 | 0.65 | 0.05 | 0.50 | 56.0% | 78.0% | 67.0% | 22 | 17 | 17 | 190.9 |
| p4 | md semantic↓ bm25↑ (0.25 / 0.75) | 0.60 | 0.25 | 0.15 | 0.25 | 0.75 | 0.05 | 0.50 | 52.0% | 74.0% | 63.0% | 24 | 22 | 22 | 190.4 |
| p5 | ts semantic↓ bm25↑ (0.50 / 0.35 / vocab 0.15) | 0.50 | 0.35 | 0.15 | 0.70 | 0.30 | 0.05 | 0.50 | 62.0% | 88.0% | 75.0% | 19 | 12 | 12 | 191.0 |
| p6 | ts semantic↓ bm25↑ (0.45 / 0.40 / vocab 0.15) | 0.45 | 0.40 | 0.15 | 0.70 | 0.30 | 0.05 | 0.50 | 64.0% | 88.0% | 76.0% | 18 | 9 | 9 | 192.6 |
| p7 | md docIntent↓ + blend (0.40 / 0.58, doc 0.02) | 0.60 | 0.25 | 0.15 | 0.40 | 0.58 | 0.02 | 0.50 | 58.0% | 82.0% | 70.0% | 21 | 15 | 15 | 191.4 |
| p8 | literal vocab↑ + md blend (0.42 / 0.58) | 0.60 | 0.25 | 0.15 | 0.42 | 0.58 | 0.05 | 0.50 | 56.0% | 78.0% | 67.0% | 22 | 16 | 16 | 191.0 |
| p9 | combo: ts 0.48/0.37 + md 0.38/0.62 doc 0.03 | 0.48 | 0.37 | 0.15 | 0.38 | 0.62 | 0.03 | 0.50 | 56.0% | 80.0% | 68.0% | 22 | 16 | 16 | 192.1 |

### Diagnostic columns

- **wrong top-1 ∩ .md**: incorrect rank-1 where the predicted file is Markdown — proxy for “semantic prose won over code literals.”
- **top-1 is .md (#)**: count of queries whose rank-1 is any `.md` file (correct or not).
