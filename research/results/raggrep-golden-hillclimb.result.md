# RAGgrep golden hill-climb (local maximum search)

- **Preset:** Fast (paraphrase-MiniLM-L3-v2)
- **Embedding:** @huggingface/transformers / `paraphrase-MiniLM-L3-v2` (`Xenova/paraphrase-MiniLM-L3-v2`)
- **k:** 10
- **Index (ms):** 19953
- **Objective:** maximize combined score = (Top-1 + Recall@k) / 2
- **Initial step:** 0.02, **min step:** 0.005
- **Axes:** TS sem/bm25 (vocab fixed), MD sem/bm25 (constant sum), docIntent, discriminative.boostCap

## Trace

| Phase | Step | Score | Top-1 | Recall | wrong top-1 | wrong∩.md | ts.sem | ts.bm25 | md.sem | md.bm25 | md.doc | disc.cap |
|-------|-----:|------:|------:|-------:|------------:|----------:|-------:|--------:|-------:|--------:|-------:|---------:|
| start | 0.0200 | 76.00% | 62.0% | 90.0% | 19 | 6 | 0.430 | 0.420 | 0.620 | 0.330 | 0.030 | 0.100 |
| climb @0.0200 #1 | 0.0200 | 78.00% | 62.0% | 94.0% | 19 | 6 | 0.430 | 0.420 | 0.620 | 0.330 | 0.030 | 0.080 |
| climb @0.0200 #2 | 0.0200 | 80.00% | 64.0% | 96.0% | 18 | 6 | 0.450 | 0.400 | 0.620 | 0.330 | 0.030 | 0.080 |
| climb @0.0200 #3 | 0.0200 | 81.00% | 66.0% | 96.0% | 17 | 5 | 0.450 | 0.400 | 0.620 | 0.330 | 0.030 | 0.060 |

_No improving neighbor at step 0.0200 — shrink grid or stop_

## Local maximum (best found)

- **Combined score:** 81.00%
- **Top-1:** 66.0%
- **Recall@k:** 96.0%
- **Evaluations:** 35

Resolved weights (merge onto `DEFAULT_RANKING_WEIGHTS` via partial):

```json
{
  "discriminative": {
    "boostCap": 0.06,
    "penaltyMax": 0.16,
    "penaltyFloor": 0.72
  },
  "typescript": {
    "semantic": 0.45,
    "bm25": 0.39999999999999997,
    "vocab": 0.15,
    "vocabBypassThreshold": 0.4
  }
}
```

_Stopping rule: no neighbor at the current step improves the score; step halved until below min-step._