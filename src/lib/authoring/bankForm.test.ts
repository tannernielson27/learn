import { describe, expect, it } from "vitest";
import { BANK_NAME_ERROR, parseBankForm } from "./bankForm";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("parseBankForm", () => {
  it("accepts a name, trimming the edges and collapsing inner runs of spaces", () => {
    expect(parseBankForm(form({ name: "  Cardiac    and   renal  " }))).toEqual({
      ok: true,
      name: "Cardiac and renal",
    });
  });

  it.each([[""], ["    "]])("rejects an empty name %j", (name) => {
    expect(parseBankForm(form({ name }))).toEqual({ ok: false, error: BANK_NAME_ERROR });
  });

  it("rejects a name longer than the database allows", () => {
    expect(parseBankForm(form({ name: "a".repeat(121) })).ok).toBe(false);
    expect(parseBankForm(form({ name: "a".repeat(120) })).ok).toBe(true);
  });

  it("treats a missing field as empty", () => {
    expect(parseBankForm(new FormData()).ok).toBe(false);
  });

  it("says what to do in the message", () => {
    expect(BANK_NAME_ERROR).toBe("Give the bank a name of up to 120 characters.");
  });
});
