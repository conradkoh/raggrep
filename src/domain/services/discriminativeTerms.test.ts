import { describe, expect, test } from "bun:test";
import { BM25Index } from "./bm25";
import { scoreDiscriminativeTerms } from "./discriminativeTerms";

function buildIndex(contents: Record<string, string>): BM25Index {
  const ix = new BM25Index();
  for (const [id, content] of Object.entries(contents)) {
    ix.addDocuments([{ id, content }]);
  }
  return ix;
}

describe("scoreDiscriminativeTerms", () => {
  test("no indexed query tokens yields neutral adjustment", () => {
    const ix = buildIndex({
      a: "hello world",
      b: "foo bar",
    });
    const r = scoreDiscriminativeTerms(ix, "xyzunknown", "hello world");
    expect(r.penaltyFactor).toBe(1);
    expect(r.boost).toBe(0);
    expect(r.salientCoverage).toBe(1);
  });

  test("chunk matching salient terms gets boost and higher coverage", () => {
    const rareDoc =
      "convex oauth google backend schema";
    const ix = buildIndex({
      d1: "common stuff everywhere schema database",
      d2: "common stuff everywhere schema database",
      d3: "common stuff everywhere schema database",
      rare: rareDoc,
    });
    const q =
      "Where is the Convex defineSchema database schema with oauth google?";
    const hit = scoreDiscriminativeTerms(ix, q, rareDoc, undefined);
    const miss = scoreDiscriminativeTerms(
      ix,
      q,
      "common stuff everywhere schema database",
      undefined
    );
    expect(hit.salientCoverage).toBeGreaterThan(miss.salientCoverage);
    expect(hit.boost).toBeGreaterThanOrEqual(miss.boost);
    expect(hit.penaltyFactor).toBeGreaterThanOrEqual(miss.penaltyFactor);
  });

  test("includes chunk name when matching", () => {
    const ix = buildIndex({
      c: "function body only",
    });
    const r = scoreDiscriminativeTerms(ix, "find WidgetFactory", "", "WidgetFactory");
    expect(r.matchedSalient.length).toBeGreaterThanOrEqual(0);
    expect(r.salientTerms.length).toBeGreaterThanOrEqual(0);
  });

  test("prefix overlap counts as salient hit (document vs documentation)", () => {
    const body = "This document covers database setup";
    const ix = buildIndex({
      doc: body,
      other: "full documentation for the api",
    });
    const r = scoreDiscriminativeTerms(
      ix,
      "database documentation guide",
      body,
      undefined
    );
    expect(r.matchedSalient).toContain("documentation");
    expect(r.salientCoverage).toBeGreaterThan(0);
  });
});
