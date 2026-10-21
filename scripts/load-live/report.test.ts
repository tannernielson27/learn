import { describe, expect, it } from "vitest";
import { formatTable, isUnexpectedRefusal, percentile, summarize } from "./report.mjs";

describe("percentile", () => {
  it("uses the nearest rank, on a sorted copy", () => {
    const values = [50, 10, 40, 20, 30];
    expect(percentile(values, 50)).toBe(30);
    expect(percentile(values, 95)).toBe(50);
    expect(percentile(values, 0)).toBe(10);
    expect(values).toEqual([50, 10, 40, 20, 30]);
  });

  it("answers null for nothing measured", () => {
    expect(percentile([], 50)).toBeNull();
  });
});

describe("summarize", () => {
  it("rounds to whole milliseconds", () => {
    expect(summarize([1.2, 2.6, 3.4, 100.5])).toEqual({
      count: 4,
      p50: 3,
      p95: 101,
      max: 101,
      mean: 27,
    });
  });

  it("reports an empty series as zero measurements, not as zeros", () => {
    expect(summarize([])).toEqual({ count: 0, p50: null, p95: null, max: null, mean: null });
  });
});

describe("isUnexpectedRefusal", () => {
  it("treats a room that moved on under a slow answer as expected, and everything else not", () => {
    const expected = [
      "wrong_item",
      "already_revealed",
      "not_started",
      "paused",
      "not_open",
      "time_up",
    ];
    for (const code of expected) {
      expect(isUnexpectedRefusal(code)).toBe(false);
    }
    for (const code of ["rate_limited", "malformed", "wrong_type", "not_joined", "http_500"]) {
      expect(isUnexpectedRefusal(code)).toBe(true);
    }
  });
});

describe("formatTable", () => {
  it("prints the measures a run is judged on and nothing secret", () => {
    const table = formatTable({
      participants: 60,
      joined: 60,
      join: summarize([100, 200]),
      view: summarize([10, 20]),
      submit: summarize([30, 40]),
      submitted: 300,
      skipped: 20,
      refusals: { wrong_item: 2, rate_limited: 1 },
      unexpectedRefusals: 1,
      realtime: { total: 600, perParticipant: { min: 9, median: 10, max: 11 } },
    });
    expect(table).toContain("joined");
    expect(table).toMatch(/60\s*\/\s*60/);
    expect(table).toMatch(/submit ms/);
    expect(table).toMatch(/wrong_item=2/);
    expect(table).toMatch(/unexpected\s+1/);
    expect(table).toMatch(/realtime msgs.*9.*10.*11/);
  });
});
