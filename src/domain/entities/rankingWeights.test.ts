import { describe, expect, test } from "bun:test";
import {
  DEFAULT_RANKING_WEIGHTS,
  mergeRankingWeights,
} from "./rankingWeights";

describe("mergeRankingWeights", () => {
  test("returns defaults when undefined", () => {
    expect(mergeRankingWeights(undefined)).toEqual(DEFAULT_RANKING_WEIGHTS);
  });

  test("merges partial discriminative overrides", () => {
    const m = mergeRankingWeights({
      discriminative: { penaltyMax: 0.2 },
    });
    expect(m.discriminative.penaltyMax).toBe(0.2);
    expect(m.discriminative.boostCap).toBe(
      DEFAULT_RANKING_WEIGHTS.discriminative.boostCap
    );
  });

  test("merges typescript blend", () => {
    const m = mergeRankingWeights({
      typescript: { semantic: 0.5 },
    });
    expect(m.typescript.semantic).toBe(0.5);
    expect(m.typescript.bm25).toBe(DEFAULT_RANKING_WEIGHTS.typescript.bm25);
  });
});
