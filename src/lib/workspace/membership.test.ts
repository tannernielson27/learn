import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MOVE_CONFIRM_FIELD,
  moveConfirmed,
  moveConfirmLabel,
  moveLossCounts,
  moveWarning,
  REMOVE_ANSWERS,
  REMOVE_FAILED,
  REMOVE_REFUSED,
  removeColleague,
  type RemovedMember,
  removeWarning,
} from "./membership";

const MEMBER = "00000000-0000-4000-8000-0000000000b2";
const logged = vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => logged.mockClear());

describe("removeColleague", () => {
  it("removes the member it was given and says nothing more", async () => {
    const remove = vi.fn(async (): Promise<RemovedMember> => "removed");
    expect(await removeColleague(MEMBER, { remove })).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith(MEMBER);
  });

  it.each(["shared_workspace", "not_founder", "is_founder", "not_found", "failed"] as const)(
    "gives %s its own sentence",
    async (answer) => {
      const outcome = await removeColleague(MEMBER, { remove: async () => answer });
      expect(outcome).toEqual({ ok: false, message: REMOVE_REFUSED[answer] });
    },
  );

  it("has a sentence for every answer the database gives, each different", () => {
    const refusals = REMOVE_ANSWERS.filter((answer) => answer !== "removed");
    const sentences = refusals.map((answer) => REMOVE_REFUSED[answer]);
    expect(sentences.every((sentence) => sentence.length > 20)).toBe(true);
    expect(new Set(sentences).size).toBe(refusals.length);
  });

  it("treats a call that throws as a failure, and logs only the error's name", async () => {
    const outcome = await removeColleague(MEMBER, {
      remove: async () => {
        throw new TypeError(`no route to ${MEMBER}`);
      },
    });
    expect(outcome).toEqual({ ok: false, message: REMOVE_FAILED });
    const said = JSON.stringify(logged.mock.calls);
    expect(said).toContain("TypeError");
    expect(said).not.toContain(MEMBER);
  });

  it("falls back to the failure sentence for an answer nobody knows", async () => {
    const outcome = await removeColleague(MEMBER, {
      remove: async () => "banished" as RemovedMember,
    });
    expect(outcome).toEqual({ ok: false, message: REMOVE_FAILED });
  });
});

describe("removeWarning", () => {
  it("names the colleague and says plainly what happens", () => {
    const warning = removeWarning("Mary Seacole");
    expect(warning).toMatch(/^Mary Seacole loses access to this workspace at once/);
    expect(warning).toContain("Everything they made here stays here.");
    expect(warning).toContain("a new, empty workspace of their own");
    expect(warning).toContain("Any live session they are running ends now");
    expect(warning).toContain("revoked");
  });
});

describe("what a move costs", () => {
  const preview = { leavingWorkspace: "Grace’s workspace", bankCount: 3, classCount: 1 };

  it.each([
    [0, 0, "0 item banks and 0 classes"],
    [1, 1, "1 item bank and 1 class"],
    [3, 1, "3 item banks and 1 class"],
    [1, 12, "1 item bank and 12 classes"],
  ])("counts %i banks and %i classes", (bankCount, classCount, said) => {
    expect(moveLossCounts({ bankCount, classCount })).toBe(said);
  });

  it("names the workspace left and counts what is lost", () => {
    const warning = moveWarning(preview);
    expect(warning).toContain("You teach in Grace’s workspace now.");
    expect(warning).toContain("you lose access to its 3 item banks and 1 class");
    expect(warning).toContain("Nothing is deleted, and nothing comes with you.");
  });

  it("labels the box with the workspace it gives up", () => {
    expect(moveConfirmLabel(preview)).toBe(
      "I understand that I will leave Grace’s workspace and lose access to everything in it.",
    );
  });
});

describe("moveConfirmed", () => {
  function posted(value?: string): FormData {
    const form = new FormData();
    if (value !== undefined) form.set(MOVE_CONFIRM_FIELD, value);
    return form;
  }

  it("is true only for a ticked box", () => {
    expect(moveConfirmed(posted("on"))).toBe(true);
  });

  it.each([undefined, "", "off", "true", "1", "ON"])("is false for %s", (value) => {
    expect(moveConfirmed(posted(value))).toBe(false);
  });
});
