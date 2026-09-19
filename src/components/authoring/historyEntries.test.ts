import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { toItemRow } from "@/lib/supabase/itemRows";
import { multipleChoiceItemSchema } from "@/lib/ngn/schemas";
import { historyEntries } from "./historyEntries";

const ITEM_ID = "3f0c9a52-8d4e-4f6b-9a41-6c2d7e8f9012";
const canonical = () =>
  multipleChoiceItemSchema.parse({ ...FIXTURES.multiple_choice.canonical, id: ITEM_ID });

// The draft as the editor page reads it: the item's row, now on version 2 with option B keyed.
const draftRow = () => ({
  id: ITEM_ID,
  ...toItemRow({ ...canonical(), version: 2, answerKey: { correctOptionId: "opt_b" } }),
});

const snapshot = (version: number, correctOptionId: string) =>
  JSON.parse(
    JSON.stringify({ ...canonical(), version, answerKey: { correctOptionId } }),
  ) as unknown;

describe("historyEntries", () => {
  it("lists each version with what differs from the draft and a form to restore it", () => {
    const entries = historyEntries(draftRow(), [
      { version: 2, created_at: "2026-09-19T10:00:00.000Z", snapshot: snapshot(2, "opt_b") },
      { version: 1, created_at: "2026-09-18T10:00:00.000Z", snapshot: snapshot(1, "opt_a") },
    ]);

    expect(entries.map((entry) => [entry.version, entry.published, entry.changes])).toEqual([
      [2, "Published Sep 19, 2026", []],
      [1, "Published Sep 18, 2026", ["The answer key changed."]],
    ]);
    const first = entries[1]!;
    if (!first.ok) throw new Error("version 1 should be restorable");
    expect(first.item.answerKey).toEqual({ correctOptionId: "opt_a" });
    // Restoring keeps the draft's own version number: the server sets the next one on publish.
    expect(first.restore).toMatchObject({
      itemId: ITEM_ID,
      type: "multiple_choice",
      initialValues: { correctOptionId: "opt_a", version: 2, id: ITEM_ID },
    });
  });

  it("opens a snapshot that no longer validates read-only, with its reason", () => {
    const broken = { ...(snapshot(1, "opt_a") as object), stem: { kind: "markdown", value: "" } };
    const [entry] = historyEntries(draftRow(), [
      { version: 1, created_at: "2026-09-18T10:00:00.000Z", snapshot: broken },
    ]);
    expect(entry).toEqual({
      version: 1,
      published: "Published Sep 18, 2026",
      changes: ["The stem changed.", "The answer key changed."],
      ok: false,
      reason:
        "This version no longer matches the current question format, so it can be read here but not restored.",
    });
  });

  it("opens a snapshot of an unknown type read-only", () => {
    const row = { ...draftRow(), type: "future_type" };
    const [entry] = historyEntries(row, [
      {
        version: 1,
        created_at: "2026-09-18T10:00:00.000Z",
        snapshot: { ...(snapshot(1, "opt_a") as object), type: "future_type" },
      },
    ]);
    expect(entry).toMatchObject({ ok: false });
  });
});
