import { describe, expect, it } from "vitest";
import { editorFor } from "@/components/authoring/editorFor";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { ITEM_TYPES } from "@/lib/ngn/labels";
import { itemSchema } from "@/lib/ngn/schemas";
import { inputFromForm } from "./codecs";

const ID = "00000000-0000-4000-8000-0000000000e1";

describe("inputFromForm", () => {
  it.each(ITEM_TYPES)("reads a %s form back into a valid item of its type", (type) => {
    const editor = editorFor(ID, type, FIXTURES[type].canonical);
    expect(editor).not.toBeNull();
    const read = inputFromForm(type, editor!.initialValues);
    expect(read.ok).toBe(true);
    const parsed = itemSchema.safeParse(read.ok ? read.values : null);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.type).toBe(type);
  });

  it("refuses values that are not the type's form", () => {
    expect(inputFromForm("matrix_multiple_choice", { stem: 4 })).toMatchObject({ ok: false });
    expect(inputFromForm("bowtie", null)).toMatchObject({ ok: false });
  });
});
