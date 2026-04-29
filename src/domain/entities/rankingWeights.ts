/**
 * Hybrid retrieval ranking weights — numeric knobs only, suitable for config
 * and benchmark-driven tuning. Defaults preserve historical module behavior.
 */

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

export const DEFAULT_RANKING_WEIGHTS: RankingWeightsConfig = {
  discriminative: DEFAULT_DISCRIMINATIVE_WEIGHTS,
  typescript: {
    semantic: 0.6,
    bm25: 0.25,
    vocab: 0.15,
    vocabBypassThreshold: 0.4,
  },
  language: {
    semantic: 0.7,
    bm25: 0.3,
  },
  markdown: {
    semantic: 0.7,
    bm25: 0.3,
    docIntentBoost: 0.05,
    headingPhraseCoverageMin: 0.25,
    headingPhraseCoverageSpan: 0.75,
  },
  json: {
    bm25: 0.4,
    literalBaseWeight: 0.6,
  },
};

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
  };
}
