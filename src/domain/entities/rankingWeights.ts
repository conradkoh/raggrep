/**
 * Hybrid retrieval ranking weights — numeric knobs only, suitable for config
 * and benchmark-driven tuning. Defaults follow golden-query sweeps on next-convex-starter-app
 * (wave 2 winner: combined TS + markdown doc-intent; bge-small-en-v1.5, core + TS + markdown).
 */

import type { LiteralMatchType, LiteralConfidence } from "./literal";

/** BM25-IDF–guided salient-term adjustment (all embedding-backed language + markdown modules). */
export interface DiscriminativeWeights {
  boostCap: number;
  penaltyMax: number;
  penaltyFloor: number;
}

/** TypeScript/JS module: semantic + BM25 + vocabulary blend. */
export interface TypeScriptRankingWeights {
  semantic: number;
  bm25: number;
  vocab: number;
  /** Include chunk when vocab overlap exceeds this (bypass path). */
  vocabBypassThreshold: number;
}

/** Rust, Go, Python modules: two-way blend. */
export interface LanguageRankingWeights {
  semantic: number;
  bm25: number;
}

/** Markdown docs module. */
export interface MarkdownRankingWeights {
  semantic: number;
  bm25: number;
  /** Boost when query looks documentation-intent (legacy keyword list). */
  docIntentBoost: number;
  /** `headingBoost *= min + span * phraseMatch.coverage` */
  headingPhraseCoverageMin: number;
  headingPhraseCoverageSpan: number;
}

/** Per-confidence multipliers for one literal match kind (definition / reference / import). */
export type LiteralConfidenceMultipliers = Record<LiteralConfidence, number>;

/**
 * Literal-match boosting: multipliers when identifier/path literals align with the query,
 * plus vocabulary overlap tuning (TypeScript vocabulary track).
 */
export interface LiteralBoostWeights {
  /** Base score when a chunk is reached only via the literal index (no BM25/semantic). */
  baseScore: number;
  multipliers: Record<LiteralMatchType, LiteralConfidenceMultipliers>;
  vocabulary: {
    baseMultiplier: number;
    perWordBonus: number;
    maxVocabularyBonus: number;
    minWordsForMatch: number;
  };
}

/** JSON data module (BM25 + literal paths). */
export interface JsonRankingWeights {
  bm25: number;
  /** Scales literal-only base when BM25 is zero. */
  literalBaseWeight: number;
}

/** Full resolved set used by search (every field required). */
export interface RankingWeightsConfig {
  discriminative: DiscriminativeWeights;
  typescript: TypeScriptRankingWeights;
  language: LanguageRankingWeights;
  markdown: MarkdownRankingWeights;
  json: JsonRankingWeights;
  /** Literal / backtick / identifier match boosting (language + JSON modules). */
  literal: LiteralBoostWeights;
}

/** Partial overrides for {@link SearchOptions} or persisted module options. */
export type RankingWeightsPartial = {
  [K in keyof RankingWeightsConfig]?: Partial<RankingWeightsConfig[K]>;
};

export const DEFAULT_DISCRIMINATIVE_WEIGHTS: DiscriminativeWeights = {
  boostCap: 0.1,
  penaltyMax: 0.16,
  penaltyFloor: 0.72,
};

/** Default literal boosting (same coefficients as the original literal scorer). */
export const DEFAULT_LITERAL_BOOST_WEIGHTS: LiteralBoostWeights = {
  baseScore: 0.5,
  multipliers: {
    definition: { high: 2.5, medium: 2.0, low: 1.5 },
    reference: { high: 2.0, medium: 1.5, low: 1.3 },
    import: { high: 1.5, medium: 1.3, low: 1.1 },
  },
  vocabulary: {
    baseMultiplier: 1.3,
    perWordBonus: 0.1,
    maxVocabularyBonus: 0.5,
    minWordsForMatch: 2,
  },
};

export const DEFAULT_RANKING_WEIGHTS: RankingWeightsConfig = {
  discriminative: DEFAULT_DISCRIMINATIVE_WEIGHTS,
  typescript: {
    semantic: 0.43,
    bm25: 0.42,
    vocab: 0.15,
    vocabBypassThreshold: 0.4,
  },
  language: {
    semantic: 0.7,
    bm25: 0.3,
  },
  markdown: {
    semantic: 0.62,
    bm25: 0.33,
    docIntentBoost: 0.03,
    headingPhraseCoverageMin: 0.25,
    headingPhraseCoverageSpan: 0.75,
  },
  json: {
    bm25: 0.4,
    literalBaseWeight: 0.6,
  },
  literal: DEFAULT_LITERAL_BOOST_WEIGHTS,
};

/**
 * Merge partial literal-boost overrides (including nested multipliers / vocabulary).
 */
export function mergeLiteralWeights(
  def: LiteralBoostWeights,
  partial?: Partial<LiteralBoostWeights>
): LiteralBoostWeights {
  if (!partial) {
    return def;
  }
  return {
    baseScore: partial.baseScore ?? def.baseScore,
    multipliers: {
      definition: {
        ...def.multipliers.definition,
        ...partial.multipliers?.definition,
      },
      reference: {
        ...def.multipliers.reference,
        ...partial.multipliers?.reference,
      },
      import: { ...def.multipliers.import, ...partial.multipliers?.import },
    },
    vocabulary: { ...def.vocabulary, ...partial.vocabulary },
  };
}

/**
 * Deep-merge partial ranking overrides onto defaults. Pure function.
 */
export function mergeRankingWeights(
  partial?: RankingWeightsPartial
): RankingWeightsConfig {
  if (!partial) {
    return DEFAULT_RANKING_WEIGHTS;
  }
  return {
    discriminative: {
      ...DEFAULT_RANKING_WEIGHTS.discriminative,
      ...partial.discriminative,
    },
    typescript: {
      ...DEFAULT_RANKING_WEIGHTS.typescript,
      ...partial.typescript,
    },
    language: {
      ...DEFAULT_RANKING_WEIGHTS.language,
      ...partial.language,
    },
    markdown: {
      ...DEFAULT_RANKING_WEIGHTS.markdown,
      ...partial.markdown,
    },
    json: {
      ...DEFAULT_RANKING_WEIGHTS.json,
      ...partial.json,
    },
    literal: mergeLiteralWeights(
      DEFAULT_RANKING_WEIGHTS.literal,
      partial.literal
    ),
  };
}
