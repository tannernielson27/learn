import { describe, expect, it } from "vitest";
import type { SessionProgress } from "@/lib/live";
import { distributionFor, type Distribution, type DistributionKind } from "@/lib/live/results";
import { allFixtures } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { keepSame, sameData } from "./sameData";

/** Each fixture's canonical item, answered by every scoring case it documents: every kind, filled in. */
const answered = allFixtures.map((fixture) => ({
  name: fixture.type,
  build: (): Distribution =>
    distributionFor(
      itemSchema.parse(fixture.canonical) as Item,
      fixture.cases.map((sample) => sample.response),
    ),
}));

const BOARD = (): SessionProgress => ({
  answered: [2, 0, 1],
  rows: [
    { participantId: "p1", displayName: "Ada", positions: [1, 3] },
    { participantId: "p2", displayName: "Grace", positions: [1] },
  ],
});

type Path = (string | number)[];

/** The path to every leaf (string, number, boolean or null) in a value, so every field is checked. */
function leaves(value: unknown, path: Path = []): Path[] {
  if (value === null || typeof value !== "object") return [path];
  return Object.entries(value).flatMap(([key, inner]) =>
    leaves(inner, [...path, Array.isArray(value) ? Number(key) : key]),
  );
}

/** The path to every array in a value. */
function arrays(value: unknown, path: Path = []): Path[] {
  if (value === null || typeof value !== "object") return [];
  const own = Array.isArray(value) ? [path] : [];
  return own.concat(
    Object.entries(value).flatMap(([key, inner]) =>
      arrays(inner, [...path, Array.isArray(value) ? Number(key) : key]),
    ),
  );
}

/** A deep copy with the value at `path` replaced by `change(old)`. Never mutates `value`. */
function edit(value: unknown, path: Path, change: (old: unknown) => unknown): unknown {
  if (path.length === 0) return change(value);
  const [head, ...rest] = path;
  if (Array.isArray(value)) {
    return value.map((inner, index) => (index === head ? edit(inner, rest, change) : inner));
  }
  const record = value as Record<string, unknown>;
  return { ...record, [head as string]: edit(record[head as string], rest, change) };
}

const other = (old: unknown): unknown =>
  typeof old === "string"
    ? `${old}!`
    : typeof old === "number"
      ? old + 1
      : typeof old === "boolean"
        ? !old
        : "was null";

describe("sameData over every Distribution kind", () => {
  it("covers every kind the union has", () => {
    const kinds = new Set(answered.map(({ build }) => build().kind));
    const all: Record<DistributionKind, true> = {
      options: true,
      grid: true,
      blanks: true,
      slots: true,
      order: true,
      pairs: true,
    };
    expect([...kinds].sort()).toEqual(Object.keys(all).sort());
  });

  it.each(answered)("$name: a fresh copy with every value equal is the same", ({ build }) => {
    expect(sameData(build(), build())).toBe(true);
  });

  it.each(answered)("$name: a change to any single leaf is not the same", ({ build }) => {
    const held = build();
    const paths = leaves(held);
    expect(paths.length).toBeGreaterThan(5);
    for (const path of paths) {
      expect(sameData(held, edit(held, path, other) as Distribution), path.join(".")).toBe(false);
    }
  });

  it.each(answered)("$name: an array one entry shorter or longer is not the same", ({ build }) => {
    const held = build();
    for (const path of arrays(held)) {
      const longer = edit(held, path, (old) => [...(old as unknown[]), 0]);
      expect(sameData(held, longer as Distribution), path.join(".")).toBe(false);
      let empty = false;
      const shorter = edit(held, path, (old) => {
        empty = (old as unknown[]).length === 0;
        return (old as unknown[]).slice(0, -1);
      });
      if (!empty) expect(sameData(held, shorter as Distribution), path.join(".")).toBe(false);
    }
  });
});

describe("sameData over SessionProgress", () => {
  it("is true for a fresh copy with every value equal", () => {
    expect(sameData(BOARD(), BOARD())).toBe(true);
  });

  it("is false when any single value changes", () => {
    const held = BOARD();
    for (const path of leaves(held)) {
      expect(sameData(held, edit(held, path, other) as SessionProgress), path.join(".")).toBe(
        false,
      );
    }
  });

  it("is false when someone joins, or answers one more item", () => {
    const held = BOARD();
    const joined: SessionProgress = {
      ...held,
      rows: [...held.rows, { participantId: "p3", displayName: "Lin", positions: [] }],
    };
    const more = edit(held, ["rows", 1, "positions"], () => [1, 2]) as SessionProgress;
    expect(sameData(held, joined)).toBe(false);
    expect(sameData(held, more)).toBe(false);
  });

  it("is false when the same rows come in another order", () => {
    const held = BOARD();
    expect(sameData(held, { ...held, rows: [...held.rows].reverse() })).toBe(false);
  });
});

describe("sameData on its own", () => {
  it("treats null as equal only to null", () => {
    expect(sameData(null, null)).toBe(true);
    expect(sameData<SessionProgress | null>(null, BOARD())).toBe(false);
    expect(sameData<SessionProgress | null>(BOARD(), null)).toBe(false);
  });

  it("tells an array from an object, a missing key from an extra one, and null from an object", () => {
    expect(sameData<number[] | Record<string, number>>([], {})).toBe(false);
    expect(sameData<Record<string, number>>({ a: 1 }, { b: 1 })).toBe(false);
    expect(sameData<Record<string, number>>({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameData<{ a: number } | null>({ a: 1 }, null)).toBe(false);
    expect(sameData<{ a: number | null }>({ a: null }, { a: 0 })).toBe(false);
  });

  it("refuses at compile time anything that is not plain data", () => {
    // @ts-expect-error a Date is not plain data: its fields are not what makes two dates equal
    sameData({ at: new Date(0) }, { at: new Date(0) });
    // @ts-expect-error nor is a Map
    sameData(new Map(), new Map());
    expect(true).toBe(true);
  });
});

describe("keepSame", () => {
  it("keeps the held object when nothing changed", () => {
    const held = BOARD();
    expect(keepSame(BOARD())(held)).toBe(held);
  });

  it("takes the new object when anything changed, or when nothing is held", () => {
    const held = BOARD();
    const next = { ...BOARD(), answered: [3, 0, 1] };
    expect(keepSame(next)(held)).toBe(next);
    expect(keepSame(next)(null)).toBe(next);
  });
});
