import { describe, expect, test } from "bun:test";
import { DEFAULT_RANKING_WEIGHTS } from "../entities/rankingWeights";
import type { SearchResult } from "../entities/searchResult";
import {
  attachMatchScales,
  clamp01,
  compareSearchResultsByRankBy,
  semanticPctFromCosine,
} from "./matchScales";

describe("semanticPctFromCosine", () => {
  test("maps -1,0,1 to 0,0.5,1", () => {
    expect(semanticPctFromCosine(-1)).toBe(0);
    expect(semanticPctFromCosine(0)).toBe(0.5);
    expect(semanticPctFromCosine(1)).toBe(1);
  });
});

describe("attachMatchScales", () => {
  const base: Pick<SearchResult, "filepath" | "chunk" | "score" | "moduleId"> = {
    filepath: "a.ts",
    chunk: { id: "c" } as SearchResult["chunk"],
    score: 0.5,
    moduleId: "language/typescript",
  };

  test("typescript: splits cosine vs structured", () => {
    const r = attachMatchScales(
      {
        ...base,
        context: { semanticScore: 1, bm25Score: 0.8, vocabScore: 0.2 },
      },
      DEFAULT_RANKING_WEIGHTS
    );
    expect(r.semanticMatch).toBe(1);
    expect(r.structuredMatch).toBeGreaterThan(0);
    expect(r.structuredMatch).toBeLessThanOrEqual(1);
  });
});

describe("compareSearchResultsByRankBy", () => {
  const a: SearchResult = {
    filepath: "a",
    chunk: { id: "1" } as SearchResult["chunk"],
    score: 0.9,
    moduleId: "x",
    structuredMatch: 0.2,
    semanticMatch: 0.9,
  };
  const b: SearchResult = {
    filepath: "b",
    chunk: { id: "2" } as SearchResult["chunk"],
    score: 0.5,
    moduleId: "x",
    structuredMatch: 0.8,
    semanticMatch: 0.1,
  };

  test("structured: higher structuredMatch first", () => {
    expect(compareSearchResultsByRankBy(a, b, "structured")).toBeGreaterThan(0);
  });

  test("semantic: higher semanticMatch first", () => {
    expect(compareSearchResultsByRankBy(a, b, "semantic")).toBeLessThan(0);
  });

  test("combined: score only", () => {
    expect(compareSearchResultsByRankBy(a, b, "combined")).toBeLessThan(0);
  });
});
