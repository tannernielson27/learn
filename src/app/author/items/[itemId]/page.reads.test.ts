import { beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { toItemRow } from "@/lib/supabase/itemRows";
import { roundTrips } from "@/lib/testing/roundTrips";

/**
 * How many round trips in a row the question editor waits on. Every read is faked as a trip (see
 * `roundTrips`). The item and its published versions are both read as the author under RLS and
 * need nothing from each other, so they go out together; the item is still the 404 check.
 */

const ITEM = "00000000-0000-4000-8000-0000000000e1";
const BANK = "00000000-0000-4000-8000-0000000000b1";

let rt = roundTrips();
let row: Record<string, unknown> | null;
const asked: string[] = [];

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

const supabase = {
  from: (table: string) => {
    asked.push(table);
    const builder: Record<string, unknown> = {};
    for (const step of ["select", "eq", "order"]) builder[step] = () => builder;
    builder.maybeSingle = () => rt.trip(table, () => ({ data: row, error: null }));
    builder.limit = () => rt.trip(table, { data: [], error: null });
    return builder;
  },
};
vi.mock("@/lib/authoring/session", () => ({
  requireAuthor: () => rt.trip("auth", { supabase, orgId: "org", userId: "u", email: "" }),
}));
vi.mock("@/app/author/archiveActions", () => ({
  archiveItemAction: vi.fn(),
  restoreItemAction: vi.fn(),
}));
vi.mock("@/app/author/duplicateActions", () => ({ duplicateItemAction: vi.fn() }));

const { default: EditItemPage } = await import("./page");

const render = () =>
  rt.run(() => EditItemPage({ params: Promise.resolve({ itemId: ITEM }) } as never));

beforeEach(() => {
  rt = roundTrips();
  asked.length = 0;
  const item = itemSchema.parse({ ...FIXTURES.multiple_choice.canonical, id: ITEM });
  row = { ...toItemRow(item), id: ITEM, bank_id: BANK, status: "draft", version: 1 };
});

describe("the question editor's round trips", () => {
  it("reads the item and its versions together: 2 trips in a row, not 3", async () => {
    const result = await render();
    expect(result.ok).toBe(true);
    expect(rt.waveOf("items")).toBe(2);
    expect(rt.waveOf("item_versions")).toBe(2);
    expect(result.waves).toBe(2);
    expect(asked).toEqual(["items", "item_versions"]);
  });

  it("is still a 404 for a question this author cannot see", async () => {
    row = null;
    const result = await render();
    expect(!result.ok && (result.error as Error).message).toBe("notFound");
  });
});
