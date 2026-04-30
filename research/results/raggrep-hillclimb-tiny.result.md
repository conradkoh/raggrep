# RAGgrep golden hill-climb (local maximum search)

- **Preset:** Fast (paraphrase-MiniLM-L3-v2)
- **Embedding:** @huggingface/transformers / `paraphrase-MiniLM-L3-v2` (`Xenova/paraphrase-MiniLM-L3-v2`)
- **k:** 10
- **Index (ms):** 26705
- **Objective:** maximize combined score = (Top-1 + Recall@k) / 2
- **Initial step:** 0.02, **min step:** 0.005
- **Axes:** TS sem/bm25 (vocab fixed), MD sem/bm25 (constant sum), docIntent, discriminative.boostCap

## Trace

| Phase | Step | Score | Top-1 | Recall | wrong top-1 | wrong∩.md | ts.sem | ts.bm25 | md.sem | md.bm25 | md.doc | disc.cap |
|-------|-----:|------:|------:|-------:|------------:|----------:|-------:|--------:|-------:|--------:|-------:|---------:|
| start | 0.0200 | 76.00% | 62.0% | 90.0% | 19 | 6 | 0.430 | 0.420 | 0.620 | 0.330 | 0.030 | 0.100 |
| climb @0.0200 #1 | 0.0200 | 78.00% | 62.0% | 94.0% | 19 | 6 | 0.430 | 0.420 | 0.620 | 0.330 | 0.030 | 0.080 |

Stopped: **--max-evals** — need 8 consecutive evals for one neighbor scan (9/15 used)

## Local maximum (best found)

- **Combined score:** 78.00%
- **Top-1:** 62.0%
- **Recall@k:** 94.0%
- **Evaluations:** 15

Resolved weights (merge onto `DEFAULT_RANKING_WEIGHTS` via partial):

```json
{
  "discriminative": {
    "boostCap": 0.08,
    "penaltyMax": 0.16,
    "penaltyFloor": 0.72
  }
}
```

_Stopping rule: at each grid step, greedy ascent over all axis neighbors; shrink step until `step ≤ minStep`. Caps early if `--max-evals` would truncate a neighbor scan._