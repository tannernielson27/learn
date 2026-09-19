import { describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { multipleChoiceItemSchema } from "@/lib/ngn/schemas";
import { toItemRow } from "@/lib/supabase/itemRows";
import { historyEntries } from "./historyEntries";

// A type whose schema has landed before its editor: editorFor has nothing to open it with.
vi.mock("./editorFor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./editorFor")>()),
  editorFor: () => null,
}));

const ITEM_ID = "3f0c9a52-8d4e-4f6b-9a41-6c2d7e8f9012";

describe("historyEntries for a type without an editor", () => {
  it("opens a valid version read-only, since there is no editor to restore it into", () => {
    const item = multipleChoiceItemSchema.parse({
      ...FIXTURES.multiple_choice.canonical,
      id: ITEM_ID,
    });
    const [entry] = historyEntries({ id: ITEM_ID, ...toItemRow(item) }, [
      { version: 1, created_at: "2026-09-18T10:00:00.000Z", snapshot: item },
    ]);
    expect(entry).toMatchObject({
      ok: false,
      reason: "This kind of question has no editor yet, so this version cannot be restored.",
    });
  });
});
