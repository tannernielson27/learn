import { describe, expect, it } from "vitest";
import { FIXTURES } from "../fixtures";
import { NGN_REGISTRY } from "../registry";
import { ITEM_SCHEMAS, itemSchema, type Item } from "../schemas";
import {
  DEFAULT_DRAFT_ITEM_ID,
  DRAFT_TYPES,
  draftJsonSchema,
  fromDraft,
  isDraftType,
  itemDraftSchema,
  toDraft,
  type DraftType,
} from ".";

/** Fields whose values are ids, so the comparison can ignore which ids were chosen. */
const ID_FIELDS = new Set([
  "id",
  "rowId",
  "correctOptionId",
  "correctOptionIds",
  "correctColumnId",
  "correctColumnIds",
  "orderedIds",
  "actionIds",
  "conditionId",
  "parameterIds",
]);

/**
 * The item with every id replaced by its position among the content's ids, so two items that
 * differ only in the ids they were given compare equal.
 */
function withCanonicalIds(item: Item): unknown {
  const order = new Map<string, string>([[item.id, "#item"]]);
  const collect = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(collect);
    if (node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "id" && typeof value === "string" && !order.has(value)) {
        order.set(value, `#${order.size}`);
      }
      collect(value);
    }
  };
  collect(item.content);
  const rename = (id: string) => order.get(id) ?? `unknown:${id}`;
  const walk = (node: unknown, key?: string): unknown => {
    if (key !== undefined && ID_FIELDS.has(key)) {
      if (typeof node === "string") return rename(node);
      if (Array.isArray(node)) return node.map((id) => rename(id as string));
    }
    if (Array.isArray(node)) return node.map((child) => walk(child));
    if (node === null || typeof node !== "object") return node;
    return Object.fromEntries(
      Object.entries(node).map(([childKey, value]) =>
        key === "perElement" ? [rename(childKey), walk(value)] : [childKey, walk(value, childKey)],
      ),
    );
  };
  return walk(item);
}

describe("round trip: fromDraft(toDraft(fixture))", () => {
  const cases = DRAFT_TYPES.flatMap((type) =>
    (["canonical", "edge"] as const).map((which) => [type, which] as const),
  );

  it.each(cases)("%s %s comes back as the same item, apart from ids", (type, which) => {
    const fixture = ITEM_SCHEMAS[type].parse(FIXTURES[type][which]) as Item;
    const draft = toDraft(fixture as never);

    // What toDraft writes is a draft the model could have written.
    expect(itemDraftSchema.parse(draft)).toEqual(draft);

    const { item, reasons } = fromDraft(draft, {
      tags: fixture.tags,
      cjmmStep: fixture.cjmmStep,
      difficulty: fixture.difficulty,
    });
    expect(reasons).toEqual([]);
    const parsed = itemSchema.parse(item);
    const expected = withCanonicalIds(fixture);
    expect(JSON.stringify(expected)).not.toContain("unknown:");
    expect(withCanonicalIds(parsed)).toEqual(expected);
  });

  it("covers the seven #337 types", () => {
    expect([...DRAFT_TYPES].sort()).toEqual(
      [
        "bowtie",
        "matrix_multiple_choice",
        "matrix_multiple_response",
        "multiple_choice",
        "multiple_response",
        "multiple_response_grouping",
        "ordered_response",
      ].sort(),
    );
  });
});

describe("fromDraft context", () => {
  const draft = {
    type: "multiple_choice" as const,
    stem: "Which finding needs follow-up?",
    options: [{ text: "A *" }, { text: "B" }, { text: "C" }, { text: "D" }],
  };

  it("uses a placeholder id when the caller names none, and sets no tags or step", () => {
    const { item } = fromDraft(draft);
    expect(item.id).toBe(DEFAULT_DRAFT_ITEM_ID);
    expect(item).not.toHaveProperty("tags");
    expect(item).not.toHaveProperty("cjmmStep");
    expect(itemSchema.safeParse(item).success).toBe(true);
  });

  it("takes the id, tags, step and difficulty from the caller", () => {
    const { item } = fromDraft(draft, {
      id: "staged_7",
      tags: ["imported"],
      cjmmStep: 3,
      difficulty: "hard",
    });
    expect(item).toMatchObject({
      id: "staged_7",
      tags: ["imported"],
      cjmmStep: 3,
      difficulty: "hard",
    });
  });
});

describe("itemDraftSchema", () => {
  it("refuses a type that has no draft yet", () => {
    expect(itemDraftSchema.safeParse({ type: "dropdown_cloze", stem: "x" }).success).toBe(false);
  });

  it("refuses a draft missing its options", () => {
    expect(itemDraftSchema.safeParse({ type: "multiple_choice", stem: "x" }).success).toBe(false);
  });

  it("isDraftType tells drafted types from the rest", () => {
    expect(isDraftType("bowtie")).toBe(true);
    expect(isDraftType("dropdown_cloze")).toBe(false);
    expect(isDraftType("toString")).toBe(false);
  });
});

describe("draftJsonSchema", () => {
  const walk = (node: unknown, visit: (key: string, value: unknown) => void): void => {
    if (Array.isArray(node)) return node.forEach((child) => walk(child, visit));
    if (node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      visit(key, value);
      walk(value, visit);
    }
  };

  it.each([undefined, ...DRAFT_TYPES] as (DraftType | undefined)[])(
    "%s: fits Claude's structured outputs and asks for no ids",
    (type) => {
      const schema = draftJsonSchema(type);
      const keys: string[] = [];
      const propertyNames: string[] = [];
      walk(schema, (key, value) => {
        keys.push(key);
        if (key === "properties") propertyNames.push(...Object.keys(value as object));
        if (
          value !== null &&
          typeof value === "object" &&
          (value as { type?: unknown }).type === "object"
        ) {
          expect((value as { additionalProperties?: unknown }).additionalProperties).toBe(false);
        }
      });
      expect(keys).not.toContain("oneOf");
      expect(keys).not.toContain("$schema");
      expect(propertyNames.filter((name) => /id/i.test(name))).toEqual([]);
      expect(keys).toContain("description");
    },
  );

  it("offers every draft type when no type is named", () => {
    const schema = draftJsonSchema() as { anyOf: unknown[] };
    expect(schema.anyOf).toHaveLength(DRAFT_TYPES.length);
  });
});

describe("registry", () => {
  it("carries the draft for each drafted type and nothing for the rest", () => {
    for (const type of DRAFT_TYPES) {
      expect(NGN_REGISTRY[type].draft?.fromDraft).toBeTypeOf("function");
    }
    expect(NGN_REGISTRY.dropdown_cloze.draft).toBeUndefined();
  });
});
