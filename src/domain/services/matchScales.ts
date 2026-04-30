/**
 * Separates hybrid retrieval into two comparable [0,1] scales:
 * - **semantic**: embedding cosine mapped to a match percentage
 * - **structured**: BM25 / symbols / path / phrase / docs headings (non-embedding signals)
 *
 * Used for display and for default hybrid ranking (structured primary).
 */

import type { RankBy, SearchResult } from "../entities/searchResult";
import type { RankingWeightsConfig } from "../entities/rankingWeights";

/** Map cosine similarity [-1, 1] to [0, 1] for display / sorting. */
export function semanticPctFromCosine(cosine: number): number {
  return clamp01((cosine + 1) / 2);
}

export function clamp01(x: number): number {
  if (Number.isNaN(x) || !Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function num(ctx: Record<string, unknown>, key: string): number {
  const v = ctx[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function additiveStructuredBoost(ctx: Record<string, unknown>): number {
  return (
    num(ctx, "pathBoost") +
    num(ctx, "fileTypeBoost") +
    num(ctx, "chunkTypeBoost") +
    num(ctx, "exportBoost")
  );
}

/**
 * Populate {@link SearchResult.semanticMatch} and {@link SearchResult.structuredMatch}
 * from existing module `context` and merged ranking weights.
 */
export function attachMatchScales(
  result: SearchResult,
  rw: RankingWeightsConfig
): SearchResult {
  const ctx = (result.context ?? {}) as Record<string, unknown>;
  const mid = result.moduleId;

  let semanticMatch = 0;
  let structuredMatch = 0;

  if (mid === "language/typescript") {
    const cos = num(ctx, "semanticScore");
    const bm25 = num(ctx, "bm25Score");
    const vocab = num(ctx, "vocabScore");
    const phraseCov = num(ctx, "phraseCoverage");
    const tw = rw.typescript;
    semanticMatch = semanticPctFromCosine(cos);
    const denom = tw.bm25 + tw.vocab + 1e-9;
    const lexCore = (tw.bm25 * bm25 + tw.vocab * vocab) / denom;
    structuredMatch = clamp01(
      lexCore +
        Math.min(0.35, additiveStructuredBoost(ctx)) +
        Math.min(0.15, phraseCov * 0.25)
    );
  } else if (mid.startsWith("language/")) {
    const cos = num(ctx, "semanticScore");
    const bm25 = num(ctx, "bm25Score");
    semanticMatch = semanticPctFromCosine(cos);
    structuredMatch = clamp01(
      bm25 +
        Math.min(0.3, additiveStructuredBoost(ctx)) +
        Math.min(0.12, num(ctx, "phraseCoverage") * 0.2)
    );
  } else if (mid === "docs/markdown") {
    const cos = num(ctx, "semanticScore");
    const bm25 = num(ctx, "bm25Score");
    const docBoost = num(ctx, "docBoost");
    const headingBoost = num(ctx, "headingBoost");
    const phraseCov = num(ctx, "phraseCoverage");
    const mw = rw.markdown;
    semanticMatch = semanticPctFromCosine(cos);
    structuredMatch = clamp01(
      mw.bm25 * bm25 +
        docBoost +
        headingBoost +
        Math.min(0.2, phraseCov * 0.15)
    );
  } else if (mid === "core") {
    semanticMatch = 0;
    const nBm = num(ctx, "bm25Score");
    const sym = num(ctx, "symbolScore");
    structuredMatch = clamp01(0.6 * nBm + 0.4 * sym);
  } else if (mid === "data/json") {
    semanticMatch = 0;
    const bm25 = num(ctx, "bm25Score");
    const litM = num(ctx, "literalMultiplier");
    structuredMatch = clamp01(
      bm25 > 0.02 ? bm25 : Math.min(1, 0.35 + Math.min(0.65, (litM - 1) * 0.35))
    );
  } else {
    semanticMatch = 0;
    structuredMatch = clamp01(result.score);
  }

  return { ...result, semanticMatch, structuredMatch };
}

/** Compare results for final hybrid ordering. Default: structured → semantic → fused score. */
export function compareSearchResultsByRankBy(
  a: SearchResult,
  b: SearchResult,
  rankBy: RankBy
): number {
  if (rankBy === "combined") {
    return b.score - a.score;
  }

  const sa = a.semanticMatch ?? 0;
  const sb = b.semanticMatch ?? 0;
  const ta = a.structuredMatch ?? 0;
  const tb = b.structuredMatch ?? 0;

  if (rankBy === "semantic") {
    if (Math.abs(sb - sa) > 1e-9) return sb - sa;
    if (Math.abs(tb - ta) > 1e-9) return tb - ta;
    return b.score - a.score;
  }

  // structured (default)
  if (Math.abs(tb - ta) > 1e-9) return tb - ta;
  if (Math.abs(sb - sa) > 1e-9) return sb - sa;
  return b.score - a.score;
}
