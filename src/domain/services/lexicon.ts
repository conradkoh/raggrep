/**
 * Lexicon Service
 *
 * Provides query expansion using domain-specific synonyms.
 * Part of Structured Semantic Expansion (SSE) for improved search recall.
 *
 * This is a pure domain service with no external dependencies.
 */

import type {
  Lexicon,
  SynonymEntry,
  Synonym,
  SynonymGrade,
  ExpandedTerm,
  ExpandedQuery,
  ExpansionOptions,
} from "../entities/lexicon";
import {
  DEFAULT_EXPANSION_OPTIONS,
  EXPANSION_WEIGHTS,
} from "../entities/lexicon";

/**
 * Default lexicon for programming domain.
 *
 * Contains common synonyms for code-related terms.
 * Grades indicate correlation strength:
 * - strong: Near-equivalent (function ↔ method)
 * - moderate: Related but distinct (function ↔ handler)
 * - weak: Loosely associated (auth ↔ security)
 */
export const DEFAULT_LEXICON: Lexicon = {
  version: "1.0.0",
  entries: [
    // === Code Structure ===
    {
      term: "function",
      synonyms: [
        { term: "method", grade: "strong" },
        { term: "func", grade: "strong" },
        { term: "handler", grade: "moderate" },
        { term: "callback", grade: "moderate" },
        { term: "procedure", grade: "weak" },
        { term: "routine", grade: "weak" },
      ],
    },
    {
      term: "method",
      synonyms: [
        { term: "function", grade: "strong" },
        { term: "func", grade: "strong" },
        { term: "handler", grade: "moderate" },
      ],
    },
    {
      term: "class",
      synonyms: [
        { term: "type", grade: "moderate" },
        { term: "interface", grade: "moderate" },
        { term: "struct", grade: "moderate" },
        { term: "model", grade: "weak" },
        { term: "entity", grade: "weak" },
      ],
    },
    {
      term: "interface",
      synonyms: [
        { term: "type", grade: "strong" },
        { term: "contract", grade: "moderate" },
        { term: "protocol", grade: "weak" },
      ],
    },
    {
      term: "type",
      synonyms: [
        { term: "interface", grade: "strong" },
        { term: "typedef", grade: "strong" },
        { term: "schema", grade: "moderate" },
      ],
    },
    {
      term: "variable",
      synonyms: [
        { term: "var", grade: "strong" },
        { term: "const", grade: "strong" },
        { term: "constant", grade: "strong" },
        { term: "property", grade: "moderate" },
        { term: "field", grade: "moderate" },
      ],
    },
    {
      term: "constant",
      synonyms: [
        { term: "const", grade: "strong" },
        { term: "variable", grade: "moderate" },
        { term: "config", grade: "weak" },
      ],
    },

    // === Authentication & Security ===
    {
      term: "auth",
      synonyms: [
        { term: "authentication", grade: "strong" },
        { term: "authorization", grade: "strong" },
        { term: "login", grade: "moderate" },
        { term: "signin", grade: "moderate" },
        { term: "session", grade: "weak" },
        { term: "security", grade: "weak" },
      ],
    },
    {
      term: "authentication",
      synonyms: [
        { term: "auth", grade: "strong" },
        { term: "login", grade: "moderate" },
        { term: "signin", grade: "moderate" },
        { term: "identity", grade: "weak" },
      ],
    },
    {
      term: "authorization",
      synonyms: [
        { term: "auth", grade: "strong" },
        { term: "permission", grade: "moderate" },
        { term: "access", grade: "moderate" },
        { term: "role", grade: "weak" },
      ],
    },
    {
      term: "login",
      synonyms: [
        { term: "signin", grade: "strong" },
        { term: "auth", grade: "moderate" },
        { term: "authenticate", grade: "moderate" },
      ],
    },
    {
      term: "logout",
      synonyms: [
        { term: "signout", grade: "strong" },
        { term: "logoff", grade: "strong" },
      ],
    },
    {
      term: "password",
      synonyms: [
        { term: "pwd", grade: "strong" },
        { term: "pass", grade: "strong" },
        { term: "credential", grade: "moderate" },
        { term: "secret", grade: "weak" },
      ],
    },
    {
      term: "token",
      synonyms: [
        { term: "jwt", grade: "strong" },
        { term: "bearer", grade: "moderate" },
        { term: "credential", grade: "weak" },
      ],
    },

    // === Data & Storage ===
    {
      term: "database",
      synonyms: [
        { term: "db", grade: "strong" },
        { term: "datastore", grade: "strong" },
        { term: "storage", grade: "moderate" },
        { term: "repository", grade: "weak" },
      ],
    },
    {
      term: "query",
      synonyms: [
        { term: "select", grade: "moderate" },
        { term: "find", grade: "moderate" },
        { term: "fetch", grade: "moderate" },
        { term: "search", grade: "weak" },
      ],
    },
    {
      term: "insert",
      synonyms: [
        { term: "create", grade: "strong" },
        { term: "add", grade: "strong" },
        { term: "save", grade: "moderate" },
        { term: "store", grade: "moderate" },
      ],
    },
    {
      term: "update",
      synonyms: [
        { term: "modify", grade: "strong" },
        { term: "edit", grade: "strong" },
        { term: "patch", grade: "moderate" },
        { term: "change", grade: "moderate" },
      ],
    },
    {
      term: "delete",
      synonyms: [
        { term: "remove", grade: "strong" },
        { term: "destroy", grade: "strong" },
        { term: "drop", grade: "moderate" },
        { term: "erase", grade: "weak" },
      ],
    },
    {
      term: "cache",
      synonyms: [
        { term: "redis", grade: "moderate" },
        { term: "memcache", grade: "moderate" },
        { term: "store", grade: "weak" },
        { term: "buffer", grade: "weak" },
      ],
    },

    // === API & HTTP ===
    {
      term: "api",
      synonyms: [
        { term: "endpoint", grade: "strong" },
        { term: "route", grade: "moderate" },
        { term: "rest", grade: "moderate" },
        { term: "service", grade: "weak" },
      ],
    },
    {
      term: "endpoint",
      synonyms: [
        { term: "api", grade: "strong" },
        { term: "route", grade: "strong" },
        { term: "path", grade: "moderate" },
      ],
    },
    {
      term: "request",
      synonyms: [
        { term: "req", grade: "strong" },
        { term: "call", grade: "moderate" },
        { term: "fetch", grade: "moderate" },
      ],
    },
    {
      term: "response",
      synonyms: [
        { term: "res", grade: "strong" },
        { term: "reply", grade: "moderate" },
        { term: "result", grade: "weak" },
      ],
    },
    {
      term: "middleware",
      synonyms: [
        { term: "interceptor", grade: "moderate" },
        { term: "filter", grade: "moderate" },
        { term: "handler", grade: "weak" },
      ],
    },

    // === Error Handling ===
    {
      term: "error",
      synonyms: [
        { term: "exception", grade: "strong" },
        { term: "err", grade: "strong" },
        { term: "failure", grade: "moderate" },
        { term: "fault", grade: "weak" },
      ],
    },
    {
      term: "exception",
      synonyms: [
        { term: "error", grade: "strong" },
        { term: "throw", grade: "moderate" },
        { term: "catch", grade: "moderate" },
      ],
    },
    {
      term: "validate",
      synonyms: [
        { term: "verify", grade: "strong" },
        { term: "check", grade: "strong" },
        { term: "assert", grade: "moderate" },
        { term: "ensure", grade: "moderate" },
      ],
    },

    // === Configuration ===
    {
      term: "config",
      synonyms: [
        { term: "configuration", grade: "strong" },
        { term: "settings", grade: "strong" },
        { term: "options", grade: "moderate" },
        { term: "env", grade: "weak" },
        { term: "environment", grade: "weak" },
      ],
    },
    {
      term: "environment",
      synonyms: [
        { term: "env", grade: "strong" },
        { term: "config", grade: "moderate" },
        { term: "settings", grade: "weak" },
      ],
    },

    // === Testing ===
    {
      term: "test",
      synonyms: [
        { term: "spec", grade: "strong" },
        { term: "unittest", grade: "strong" },
        { term: "check", grade: "moderate" },
        { term: "verify", grade: "weak" },
      ],
    },
    {
      term: "mock",
      synonyms: [
        { term: "stub", grade: "strong" },
        { term: "fake", grade: "strong" },
        { term: "spy", grade: "moderate" },
        { term: "double", grade: "weak" },
      ],
    },

    // === Async & Events ===
    {
      term: "async",
      synonyms: [
        { term: "asynchronous", grade: "strong" },
        { term: "await", grade: "moderate" },
        { term: "promise", grade: "moderate" },
      ],
    },
    {
      term: "callback",
      synonyms: [
        { term: "handler", grade: "strong" },
        { term: "listener", grade: "moderate" },
        { term: "hook", grade: "moderate" },
      ],
    },
    {
      term: "event",
      synonyms: [
        { term: "emit", grade: "moderate" },
        { term: "trigger", grade: "moderate" },
        { term: "signal", grade: "weak" },
        { term: "message", grade: "weak" },
      ],
    },

    // === Utilities ===
    {
      term: "util",
      synonyms: [
        { term: "utility", grade: "strong" },
        { term: "utils", grade: "strong" },
        { term: "helper", grade: "strong" },
        { term: "common", grade: "weak" },
      ],
    },
    {
      term: "helper",
      synonyms: [
        { term: "util", grade: "strong" },
        { term: "utility", grade: "strong" },
        { term: "support", grade: "weak" },
      ],
    },
    {
      term: "parse",
      synonyms: [
        { term: "decode", grade: "moderate" },
        { term: "deserialize", grade: "moderate" },
        { term: "extract", grade: "weak" },
      ],
    },
    {
      term: "serialize",
      synonyms: [
        { term: "encode", grade: "moderate" },
        { term: "stringify", grade: "moderate" },
        { term: "convert", grade: "weak" },
      ],
    },

    // === Common Verbs ===
    {
      term: "get",
      synonyms: [
        { term: "fetch", grade: "strong" },
        { term: "retrieve", grade: "strong" },
        { term: "find", grade: "moderate" },
        { term: "load", grade: "moderate" },
      ],
    },
    {
      term: "set",
      synonyms: [
        { term: "assign", grade: "strong" },
        { term: "store", grade: "moderate" },
        { term: "save", grade: "moderate" },
      ],
    },
    {
      term: "find",
      synonyms: [
        { term: "search", grade: "strong" },
        { term: "locate", grade: "strong" },
        { term: "lookup", grade: "moderate" },
        { term: "get", grade: "moderate" },
      ],
    },
    {
      term: "create",
      synonyms: [
        { term: "make", grade: "strong" },
        { term: "build", grade: "strong" },
        { term: "new", grade: "moderate" },
        { term: "generate", grade: "moderate" },
      ],
    },
    {
      term: "send",
      synonyms: [
        { term: "emit", grade: "moderate" },
        { term: "dispatch", grade: "moderate" },
        { term: "post", grade: "moderate" },
        { term: "transmit", grade: "weak" },
      ],
    },
    {
      term: "receive",
      synonyms: [
        { term: "accept", grade: "moderate" },
        { term: "handle", grade: "moderate" },
        { term: "process", grade: "weak" },
      ],
    },
  ],
};

/**
 * Build a lookup map from a lexicon for fast term lookup.
 */
function buildLookupMap(lexicon: Lexicon): Map<string, SynonymEntry> {
  const map = new Map<string, SynonymEntry>();
  for (const entry of lexicon.entries) {
    map.set(entry.term.toLowerCase(), entry);
  }
  return map;
}

// Pre-built lookup map for default lexicon
const defaultLookupMap = buildLookupMap(DEFAULT_LEXICON);

/**
 * Get synonyms for a term from the lexicon.
 *
 * @param term - The term to look up
 * @param lexicon - The lexicon to use (defaults to DEFAULT_LEXICON)
 * @returns Array of synonyms with grades, or empty array if not found
 */
export function getSynonyms(
  term: string,
  lexicon: Lexicon = DEFAULT_LEXICON
): Synonym[] {
  const lookupMap =
    lexicon === DEFAULT_LEXICON ? defaultLookupMap : buildLookupMap(lexicon);
  const entry = lookupMap.get(term.toLowerCase());
  return entry ? entry.synonyms : [];
}

/**
 * Tokenize a query into terms.
 * Splits on whitespace and removes common stop words.
 */
function tokenizeQuery(query: string): string[] {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "must",
    "shall",
    "can",
    "need",
    "dare",
    "ought",
    "used",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "as",
    "into",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "between",
    "under",
    "again",
    "further",
    "then",
    "once",
    "here",
    "there",
    "when",
    "where",
    "why",
    "how",
    "all",
    "each",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "nor",
    "not",
    "only",
    "own",
    "same",
    "so",
    "than",
    "too",
    "very",
    "just",
    "and",
    "but",
    "if",
    "or",
    "because",
    "until",
    "while",
    "this",
    "that",
    "these",
    "those",
    "what",
    "which",
    "who",
    "whom",
    "i",
    "me",
    "my",
    "we",
    "our",
    "you",
    "your",
    "he",
    "him",
    "his",
    "she",
    "her",
    "it",
    "its",
    "they",
    "them",
    "their",
  ]);

  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0 && !stopWords.has(term));
}

/**
 * Expand a query using the lexicon.
 *
 * @param query - The original query string
 * @param lexicon - The lexicon to use (defaults to DEFAULT_LEXICON)
 * @param options - Expansion options
 * @returns Expanded query with weights
 */
export function expandQuery(
  query: string,
  lexicon: Lexicon = DEFAULT_LEXICON,
  options: ExpansionOptions = {}
): ExpandedQuery {
  const opts = { ...DEFAULT_EXPANSION_OPTIONS, ...options };
  const originalTerms = tokenizeQuery(query);
  const expandedTerms: ExpandedTerm[] = [];
  const seenTerms = new Set<string>();

  // Add original terms
  for (const term of originalTerms) {
    if (term.length >= opts.minTermLength && !seenTerms.has(term)) {
      expandedTerms.push({
        term,
        weight: 1.0,
        source: "original",
      });
      seenTerms.add(term);
    }
  }

  // Expand terms (single pass for now, depth > 1 not implemented)
  if (opts.maxDepth >= 1) {
    for (const term of originalTerms) {
      if (term.length < opts.minTermLength) continue;

      const synonyms = getSynonyms(term, lexicon);
      for (const syn of synonyms) {
        // Skip weak synonyms if not included
        if (syn.grade === "weak" && !opts.includeWeak) continue;

        // Skip if already seen
        const synLower = syn.term.toLowerCase();
        if (seenTerms.has(synLower)) continue;

        // Check max terms limit
        if (expandedTerms.length >= opts.maxTerms) break;

        expandedTerms.push({
          term: syn.term,
          weight: EXPANSION_WEIGHTS[syn.grade],
          source: syn.grade,
          expandedFrom: term,
        });
        seenTerms.add(synLower);
      }

      // Check max terms limit
      if (expandedTerms.length >= opts.maxTerms) break;
    }
  }

  // Build expanded query string
  // Format: "original terms [synonym1] [synonym2] ..."
  // Synonyms in brackets indicate they're expansions
  const originalPart = originalTerms.join(" ");
  const synonymPart = expandedTerms
    .filter((t) => t.source !== "original")
    .map((t) => t.term)
    .join(" ");

  const expandedQueryString = synonymPart
    ? `${originalPart} ${synonymPart}`
    : originalPart;

  return {
    originalQuery: query,
    originalTerms,
    expandedTerms,
    expandedQueryString,
    wasExpanded: expandedTerms.some((t) => t.source !== "original"),
  };
}

/**
 * Get expansion weights by grade (re-exported for convenience).
 */
export { EXPANSION_WEIGHTS };

/**
 * Get default expansion options (re-exported for convenience).
 */
export { DEFAULT_EXPANSION_OPTIONS };
