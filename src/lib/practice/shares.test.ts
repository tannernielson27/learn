import { describe, expect, it } from "vitest";
import {
  joinNames,
  parseShareTarget,
  practiceWarning,
  sharedBadge,
  shareRefusal,
  stopSharingWarning,
} from "./shares";

const ID = "00000000-0000-4000-8000-0000000000c1";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("joinNames", () => {
  it("says one, two and many names the way a sentence would", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["NUR 310"])).toBe("NUR 310");
    expect(joinNames(["NUR 310", "NUR 205"])).toBe("NUR 310 and NUR 205");
    expect(joinNames(["A", "B", "C"])).toBe("A, B and C");
  });

  it("does not change the list it is given", () => {
    const names = Object.freeze(["A", "B", "C"]);
    joinNames(names);
    expect(names).toEqual(["A", "B", "C"]);
  });
});

describe("practiceWarning", () => {
  it("says nothing when no class can see the answers", () => {
    expect(practiceWarning({ classNames: [], exposedItems: 0 })).toBeNull();
    expect(practiceWarning({ classNames: ["NUR 310"], exposedItems: 0 })).toBeNull();
  });

  it("names the class and counts the items", () => {
    expect(practiceWarning({ classNames: ["NUR 310"], exposedItems: 12 })).toBe(
      "Students in NUR 310 can see the answers to 12 of these items in practice.",
    );
  });

  it("names every class", () => {
    expect(practiceWarning({ classNames: ["NUR 205", "NUR 310"], exposedItems: 3 })).toBe(
      "Students in NUR 205 and NUR 310 can see the answers to 3 of these items in practice.",
    );
  });

  it("says one answer in the singular", () => {
    expect(practiceWarning({ classNames: ["NUR 310"], exposedItems: 1 })).toBe(
      "Students in NUR 310 can see the answer to 1 of these items in practice.",
    );
  });
});

describe("sharedBadge", () => {
  it("is empty for a bank shared with nobody", () => {
    expect(sharedBadge([])).toBeNull();
  });

  it("names the classes a bank is shared with", () => {
    expect(sharedBadge(["NUR 310"])).toBe("Shared for practice with NUR 310");
    expect(sharedBadge(["NUR 205", "NUR 310"])).toBe(
      "Shared for practice with NUR 205 and NUR 310",
    );
  });
});

describe("stopSharingWarning", () => {
  it("says the bank leaves practice now and that seen answers stay seen", () => {
    expect(stopSharingWarning("NUR 310", "Cardiac week")).toBe(
      "Students in NUR 310 lose Cardiac week from practice at once. Answers they have already seen stay seen.",
    );
  });
});

describe("parseShareTarget", () => {
  it("reads the chosen id", () => {
    expect(parseShareTarget(form({ target: ID }))).toEqual({ ok: true, id: ID });
  });

  it("refuses a missing or malformed choice", () => {
    expect(parseShareTarget(form({}))).toEqual({ ok: false });
    expect(parseShareTarget(form({ target: "" }))).toEqual({ ok: false });
    expect(parseShareTarget(form({ target: "nur-310" }))).toEqual({ ok: false });
  });

  it("refuses a file where an id belongs", () => {
    const data = new FormData();
    data.set("target", new Blob([ID]));
    expect(parseShareTarget(data)).toEqual({ ok: false });
  });
});

describe("shareRefusal", () => {
  it("has a message for every way a share can fail", () => {
    expect(shareRefusal("gone")).toMatch(/no longer exists/);
    expect(shareRefusal("rate_limited")).toMatch(/too many changes/);
    expect(shareRefusal("failed")).toMatch(/could not be shared/);
  });
});
