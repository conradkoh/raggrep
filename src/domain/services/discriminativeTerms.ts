/**
 * Discriminative query-term scoring using the session BM25 corpus.
 *
 * Rare query terms (high IDF among indexed query tokens) are treated as
 * salient: chunks that match more salient term mass rank higher; chunks that
 * miss them are slightly down-ranked. Pure logic — no I/O.
 */

import { BM25Index, tokenize } from "./bm25";
import type { DiscriminativeWeights } from "../entities/rankingWeights";
import { DEFAULT_DISCRIMINATIVE_WEIGHTS } from "../entities/rankingWeights";

/** @deprecated Use {@link DEFAULT_DISCRIMINATIVE_WEIGHTS} from entities. */
export const DISCRIMINATIVE_CONSTANTS = DEFAULT_DISCRIMINATIVE_WEIGHTS;

export interface DiscriminativeTermResult {
  /** Additive boost ∈ [0, boostCap] */
  boost: number;
  /** Multiply hybrid score by this after additive boosts (≤ 1 when penalty applies) */
  penaltyFactor: number;
  /** Query tokens (indexed in BM25) with IDF ≥ median among indexed tokens */
  salientTerms: string[];
  matchedSalient: string[];
  missingSalient: string[];
  /** Σ IDF(matched salient) / Σ IDF(salient), or 1 if no salient set */
  salientCoverage: number;
}

function medianSorted(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

const PREFIX_MATCH_MIN_LEN = 4;

/** Token or prefix overlap (handles document vs documentation style drift). */
function salientTermHitsChunk(
  term: string,
  haystack: string,
  tokenSet: Set<string>
): boolean {
  if (tokenSet.has(term) || haystack.includes(term)) {
    return true;
  }
  if (term.length < PREFIX_MATCH_MIN_LEN) {
    return false;
  }
  for (const w of tokenSet) {
    if (w.length < PREFIX_MATCH_MIN_LEN) continue;
    if (term.startsWith(w) || w.startsWith(term)) {
      return true;
    }
  }
  return false;
}

/**
 * Score how well chunk text hits corpus-rare query terms using an already-built
 * {@link BM25Index} over the same chunk set used for retrieval.
 */
export function scoreDiscriminativeTerms(
  bm25Index: BM25Index,
  query: string,
  chunkText: string,
  chunkName?: string,
  weights: DiscriminativeWeights = DEFAULT_DISCRIMINATIVE_WEIGHTS
): DiscriminativeTermResult {
  const empty = (): DiscriminativeTermResult => ({
    boost: 0,
    penaltyFactor: 1,
    salientTerms: [],
    matchedSalient: [],
    missingSalient: [],
    salientCoverage: 1,
  });

  const uniqueTerms = [...new Set(tokenize(query))];
  if (uniqueTerms.length === 0) {
    return empty();
  }

  const indexed: { term: string; idf: number }[] = [];
  for (const term of uniqueTerms) {
    const idf = bm25Index.getInverseDocumentFrequency(term);
    if (idf > 0) {
      indexed.push({ term, idf });
    }
  }

  if (indexed.length === 0) {
    return empty();
  }

  const idfSorted = [...indexed.map((x) => x.idf)].sort((a, b) => a - b);
  const medianIdf = medianSorted(idfSorted);

  const salientEntries = indexed.filter((x) => x.idf >= medianIdf);
  const salientTerms = [...new Set(salientEntries.map((x) => x.term))];

  const idfByTerm = new Map<string, number>();
  for (const { term, idf } of salientEntries) {
    idfByTerm.set(term, Math.max(idfByTerm.get(term) ?? 0, idf));
  }

  let totalW = 0;
  for (const idf of idfByTerm.values()) {
    totalW += idf;
  }

  const haystack = [chunkName ?? "", chunkText].join("\n").toLowerCase();
  const tokenSet = new Set(tokenize(chunkName ? `${chunkName}\n${chunkText}` : chunkText));

  const matchedSalient: string[] = [];
  for (const term of salientTerms) {
    const idf = idfByTerm.get(term) ?? 0;
    if (idf <= 0) continue;
    if (salientTermHitsChunk(term, haystack, tokenSet)) {
      matchedSalient.push(term);
    }
  }

  const matchedSet = new Set(matchedSalient);
  const missingSalient = salientTerms.filter((t) => !matchedSet.has(t));

  let matchedW = 0;
  for (const term of matchedSalient) {
    matchedW += idfByTerm.get(term) ?? 0;
  }

  const salientCoverage = totalW > 0 ? matchedW / totalW : 1;

  const { boostCap, penaltyMax, penaltyFloor } = weights;
  const boost = boostCap * salientCoverage;
  let penaltyFactor = 1 - penaltyMax * (1 - salientCoverage);
  if (penaltyFactor < penaltyFloor) {
    penaltyFactor = penaltyFloor;
  }

  return {
    boost,
    penaltyFactor,
    salientTerms,
    matchedSalient,
    missingSalient,
    salientCoverage,
  };
}
