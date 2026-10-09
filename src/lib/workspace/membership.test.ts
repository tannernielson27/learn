import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  logMembershipChange,
  MOVE_CONFIRM_FIELD,
  MOVE_LEAVING_FIELD,
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

  it.each([
    "shared_workspace",
    "not_founder",
    "is_founder",
    "not_found",
    "is_admin",
    "failed",
  ] as const)("gives %s its own sentence", async (answer) => {
    const outcome = await removeColleague(MEMBER, { remove: async () => answer });
    expect(outcome).toEqual({ ok: false, message: REMOVE_REFUSED[answer] });
  });

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
    expect(warning).toContain("and so is any still waiting for them");
    expect(warning).toContain("They are signed out everywhere");
    expect(warning).toContain("Any teacher still in this workspace can invite them back.");
  });
});

describe("what a move costs", () => {
  const preview = {
    leavingWorkspace: "Grace’s workspace",
    leavingWorkspaceId: "00000000-0000-4000-8000-0000000000d4",
    bankCount: 3,
    classCount: 1,
  };

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
  const LEAVING = "00000000-0000-4000-8000-0000000000d4";
  function posted(value?: string, leaving: string | null = LEAVING): FormData {
    const form = new FormData();
    if (value !== undefined) form.set(MOVE_CONFIRM_FIELD, value);
    if (leaving !== null) form.set(MOVE_LEAVING_FIELD, leaving);
    return form;
  }

  it("is the workspace named, only for a ticked box", () => {
    expect(moveConfirmed(posted("on"))).toEqual({ leaving: LEAVING });
  });

  it.each([undefined, "", "off", "true", "1", "ON"])("is nothing for a box that is %s", (value) => {
    expect(moveConfirmed(posted(value))).toBeNull();
  });

  it.each([null, "", "mine", LEAVING + "0", "' or 1=1 --"])(
    "is nothing for a ticked box with the workspace given as %s",
    (leaving) => {
      expect(moveConfirmed(posted("on", leaving))).toBeNull();
    },
  );

  it("is nothing when a file is posted in the id's place", () => {
    const form = posted("on", null);
    form.set(MOVE_LEAVING_FIELD, new Blob(["x"]));
    expect(moveConfirmed(form)).toBeNull();
  });
});

describe("logMembershipChange", () => {
  it("writes one line with the three ids and nothing else", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logMembershipChange("member_removed", { actor: "a-1", target: "t-2", org: "o-3" });
    expect(info.mock.calls).toEqual([
      ["[workspace] member_removed", { actor: "a-1", target: "t-2", org: "o-3" }],
    ]);
    info.mockRestore();
  });

  it("carries nothing it was not given: no name and no address can ride along", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logMembershipChange("teacher_moved", {
      actor: "a-1",
      target: "a-1",
      org: "o-3",
      email: "mary@school.edu",
      name: "Mary Seacole",
    } as Parameters<typeof logMembershipChange>[1]);
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/mary|Seacole/);
    info.mockRestore();
  });
});
