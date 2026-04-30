# RAGgrep golden benchmark: weight sweep (next-convex)

- **Generated:** 2026-04-30T05:12:04.418Z
- **Dataset:** next-convex-starter-app
- **Pinned commit:** `7518c373c3a72279252cb9eaef54c1a936f1bd0c`
- **Preset:** Quality (bge-small-en-v1.5)
- **Embedding library:** `@huggingface/transformers` (huggingface)
- **Embedding model name:** `bge-small-en-v1.5`
- **Embedding model id (Transformers):** `Xenova/bge-small-en-v1.5`
- **Index modules:** core, language/typescript, docs/markdown
- **k:** 10
- **Fingerprint:** `7ce4e4450553060fe15e5e3ac7bcd49d`
- **Queries:** 50
- **Index time (ms):** 45632

## Weight sweep — comparison (primary)

Hypothesis: **heavy semantic weight lets prose-like chunks (often Markdown) score highly even when the query names concrete code symbols**; lowering `markdown.semantic` / raising `markdown.bm25` may reduce false `.md` top-1s.

| Pass | Label | ts.sem | ts.bm25 | ts.vocab | md.sem | md.bm25 | md.doc | lit.base | Top-1 | Recall@k | Score | wrong top-1 | wrong top-1 ∩ .md | top-1 is .md (#) | retrieval μ ms |
|------|-------|-------:|--------:|---------:|-------:|--------:|-------:|---------:|------:|----------:|------:|------------:|-------------------:|-----------------:|---------------:|
| p0 | baseline (defaults) | 0.43 | 0.42 | 0.15 | 0.62 | 0.33 | 0.03 | 0.50 | 76.0% | 98.0% | 87.0% | 12 | 0 | 0 | 192.3 |
| p1 | ts 0.40 / 0.45 / 0.15 (more BM25) | 0.40 | 0.45 | 0.15 | 0.62 | 0.33 | 0.03 | 0.50 | 76.0% | 98.0% | 87.0% | 12 | 0 | 0 | 191.7 |
| p2 | ts 0.48 / 0.37 / 0.15 (more semantic) | 0.48 | 0.37 | 0.15 | 0.62 | 0.33 | 0.03 | 0.50 | 70.0% | 98.0% | 84.0% | 15 | 0 | 0 | 189.9 |
| p3 | ts 0.38 / 0.47 / 0.15 (max BM25) | 0.38 | 0.47 | 0.15 | 0.62 | 0.33 | 0.03 | 0.50 | 78.0% | 96.0% | 87.0% | 11 | 0 | 0 | 191.2 |
| p4 | ts 0.43 / 0.42 / 0.15 (balanced) | 0.43 | 0.42 | 0.15 | 0.62 | 0.33 | 0.03 | 0.50 | 76.0% | 98.0% | 87.0% | 12 | 0 | 0 | 190.4 |
| p5 | md 0.65 / 0.35 (gentle sem↓) | 0.43 | 0.42 | 0.15 | 0.65 | 0.35 | 0.03 | 0.50 | 76.0% | 98.0% | 87.0% | 12 | 0 | 0 | 189.8 |
| p6 | md 0.58 / 0.42 | 0.43 | 0.42 | 0.15 | 0.58 | 0.42 | 0.03 | 0.50 | 76.0% | 96.0% | 86.0% | 12 | 0 | 0 | 192.1 |
| p7 | ts vocab↑ 0.42 / 0.40 / 0.18 | 0.42 | 0.40 | 0.18 | 0.62 | 0.33 | 0.03 | 0.50 | 70.0% | 98.0% | 84.0% | 15 | 0 | 0 | 191.3 |
| p8 | discriminative boostCap 0.12 | 0.43 | 0.42 | 0.15 | 0.62 | 0.33 | 0.03 | 0.50 | 78.0% | 98.0% | 88.0% | 11 | 0 | 0 | 190.6 |
| p9 | combo ts 0.43/0.42 + md 0.62/0.33 doc 0.02 (vs default doc 0.03) | 0.43 | 0.42 | 0.15 | 0.62 | 0.33 | 0.02 | 0.50 | 76.0% | 98.0% | 87.0% | 12 | 0 | 0 | 190.6 |

### Diagnostic columns

- **wrong top-1 ∩ .md**: incorrect rank-1 where the predicted file is Markdown — proxy for “semantic prose won over code literals.”
- **top-1 is .md (#)**: count of queries whose rank-1 is any `.md` file (correct or not).
