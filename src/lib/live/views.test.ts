import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { toKeylessItem } from "@/lib/ngn/submit";
import type { CaseStudyRun } from "./caseStudyRuns";
import { initialSessionState, type LiveSessionState } from "./state";
import { NO_TIMER } from "./timer";
import type { ItemReveal, ParticipantItem } from "./transport";
import {
  controlView,
  phoneView,
  stageView,
  type HostViewInput,
  type PhoneView,
  type PhoneViewInput,
} from "./views";

const NOW = 1_800_000_000_000;
const ITEM: Item = itemSchema.parse(FIXTURES.multiple_choice.canonical);
const KEYLESS: ParticipantItem = toKeylessItem(ITEM) as ParticipantItem;
const NAMES = ["Ada Lovelace", "Grace Hopper", "Mary Seacole"];

const at = (over: Partial<LiveSessionState> = {}): LiveSessionState => ({
  status: "running",
  position: 1,
  itemCount: 3,
  reveal: false,
  timer: NO_TIMER,
  ...over,
});

const host = (over: Partial<HostViewInput> = {}): HostViewInput => ({
  state: at(),
  code: "LEARN7",
  names: NAMES,
  answered: 2,
  connection: "connected",
  ...over,
});

const REVEAL: ItemReveal = {
  itemId: ITEM.id,
  position: 1,
  reveal: { answerKey: ITEM.answerKey, rationale: ITEM.rationale, scoring: ITEM.scoring } as never,
  score: null,
};

const phone = (over: Partial<PhoneViewInput> = {}): PhoneViewInput => ({
  state: at(),
  item: KEYLESS,
  answered: null,
  revealed: null,
  connection: "connected",
  refused: false,
  joined: 3,
  now: NOW,
  ...over,
});

const RUN: CaseStudyRun = {
  caseStudyId: "cs-1",
  title: "Heart failure",
  firstPosition: 2,
  stepCount: 6,
  record: null,
};

describe("stageView", () => {
  it("shows the code and the names in the lobby", () => {
    expect(stageView(host({ state: initialSessionState(3) }))).toEqual({
      phase: "lobby",
      code: "LEARN7",
      names: NAMES,
      joined: 3,
    });
  });

  it("shows counts, never names, once the session has started", () => {
    const running = [
      at(),
      at({ reveal: true }),
      at({ status: "paused" }),
      at({ status: "ended" }),
      at({ position: 2 }),
    ];
    for (const state of running) {
      const view = stageView(host({ state, runs: [RUN] }));
      expect(JSON.stringify(view)).not.toContain("Ada");
    }
  });

  it("names the question, its clock and the tally", () => {
    const timer = { seconds: 30, endsAt: NOW + 20_000, remainingMs: null };
    expect(stageView(host({ state: at({ timer }) }))).toEqual({
      phase: "question",
      code: "LEARN7",
      place: { position: 1, itemCount: 3, label: "Question 1 of 3", caseStep: null },
      tally: { answered: 2, joined: 3 },
      timer,
    });
  });

  it("tells a case study's step from a loose question", () => {
    const view = stageView(host({ state: at({ position: 3, itemCount: 8 }), runs: [RUN] }));
    expect(view).toMatchObject({
      phase: "caseStep",
      caseStep: { caseStudyId: "cs-1", title: "Heart failure", step: 2, stepCount: 6 },
      place: { label: "Question 3 of 8 · Step 2 of 6: Analyze Cues" },
    });
    const single = stageView(host({ state: at({ position: 4, itemCount: 6 }), caseStudy: true }));
    expect(single).toMatchObject({
      phase: "caseStep",
      caseStep: { caseStudyId: null, title: null, step: 4, stepCount: 6 },
    });
  });

  it("shows the answer, the pause and the end", () => {
    expect(stageView(host({ state: at({ reveal: true }) })).phase).toBe("answerShowing");
    expect(stageView(host({ state: at({ status: "paused" }) })).phase).toBe("paused");
    expect(stageView(host({ state: at({ status: "ended", position: 2 }) }))).toEqual({
      phase: "ended",
      summary: { questionsRun: 2, itemCount: 3, joined: 3 },
    });
    expect(
      stageView(host({ state: at({ status: "ended", position: null }), names: [] })),
    ).toMatchObject({ summary: { questionsRun: 0, joined: 0 } });
  });

  it("has no position in a student-paced room, and counts every item run at the end", () => {
    const paced = at({ mode: "student_paced" });
    expect(stageView(host({ state: paced }))).toMatchObject({
      phase: "question",
      place: { position: null, label: null, caseStep: null },
    });
    expect(stageView(host({ state: { ...paced, status: "ended" } }))).toMatchObject({
      summary: { questionsRun: 3 },
    });
  });
});

describe("controlView", () => {
  it("adds the names, the connection and the buttons to every phase", () => {
    const view = controlView(host({ state: at({ status: "paused" }), connection: "reconnecting" }));
    expect(view).toMatchObject({
      phase: "paused",
      names: NAMES,
      connection: "reconnecting",
      studentPaced: false,
    });
    expect(view.commands.map((entry) => entry.command)).toEqual([
      "reveal",
      "advance",
      "resume",
      "end",
    ]);
  });

  it("offers Start in the lobby and nothing once ended", () => {
    expect(controlView(host({ state: initialSessionState(3) })).commands).toHaveLength(2);
    expect(controlView(host({ state: at({ status: "ended" }) })).commands).toEqual([]);
  });

  it("says a room is student-paced", () => {
    expect(controlView(host({ state: at({ mode: "student_paced" }) })).studentPaced).toBe(true);
  });
});

describe("phoneView", () => {
  it("waits in the lobby with the count", () => {
    expect(phoneView(phone({ state: initialSessionState(3) }))).toEqual({
      phase: "waiting",
      headline: "You’re in.",
      joined: 3,
    });
  });

  it("answers, then has sent its answer", () => {
    expect(phoneView(phone())).toMatchObject({ phase: "answering", studentPaced: false });
    expect(
      phoneView(phone({ answered: { itemId: ITEM.id, submittedAt: NOW - 1_000 } })),
    ).toMatchObject({ phase: "answerSent", submittedAt: NOW - 1_000 });
    // An answer to the item before is not an answer to this one.
    expect(phoneView(phone({ answered: { itemId: "other", submittedAt: NOW } })).phase).toBe(
      "answering",
    );
  });

  it("says the time is up on the session's clock, but not on a frozen clock", () => {
    const over = { seconds: 30, endsAt: NOW - 1, remainingMs: null };
    expect(phoneView(phone({ state: at({ timer: over }) })).phase).toBe("timeUp");
    const frozen = { seconds: 30, endsAt: null, remainingMs: 0 };
    expect(phoneView(phone({ state: at({ timer: frozen }) })).phase).toBe("answering");
  });

  it("shows the answer for the item on screen, and whether this phone answered", () => {
    const view = phoneView(
      phone({
        state: at({ reveal: true }),
        revealed: REVEAL,
        answered: { itemId: ITEM.id, submittedAt: NOW },
      }),
    );
    expect(view).toMatchObject({ phase: "answerShowing", revealed: REVEAL, answered: true });
    const stale = phoneView(
      phone({ state: at({ reveal: true, position: 2 }), revealed: REVEAL, item: null }),
    );
    expect(stale).toMatchObject({ phase: "answerShowing", revealed: null, answered: false });
  });

  it("is paused and ended in the waiting screen's words", () => {
    expect(phoneView(phone({ state: at({ status: "paused" }) }))).toMatchObject({
      phase: "paused",
      headline: "The live session is paused.",
    });
    expect(phoneView(phone({ state: at({ status: "ended" }) }))).toMatchObject({
      phase: "ended",
    });
  });

  it("keeps the question under a reconnecting banner, but not an ended session", () => {
    const view = phoneView(phone({ connection: "reconnecting" }));
    expect(view).toMatchObject({ phase: "reconnecting", underneath: { phase: "answering" } });
    expect(phoneView(phone({ connection: "offline" })).phase).toBe("reconnecting");
    expect(phoneView(phone({ connection: "offline", state: at({ status: "ended" }) })).phase).toBe(
      "ended",
    );
  });

  it("is refused whatever the room is doing", () => {
    expect(phoneView(phone({ refused: true, connection: "offline" }))).toEqual({
      phase: "refused",
    });
  });

  it("works through a student-paced set with no one item", () => {
    const paced = at({ mode: "student_paced" });
    expect(phoneView(phone({ state: paced }))).toMatchObject({
      phase: "answering",
      studentPaced: true,
      item: null,
    });
    expect(phoneView(phone({ state: { ...paced, reveal: true }, revealed: REVEAL }))).toMatchObject(
      { phase: "answerShowing", revealed: null },
    );
  });
});

describe("phoneView never carries a key before the reveal (ADR 0003)", () => {
  /** An item that should never reach a phone, as a mis-wired adapter might send it. */
  const KEYED = ITEM as unknown as ParticipantItem;
  const secrets = [JSON.stringify(ITEM.answerKey), "answerKey", "rationale", "scoring"];

  const beforeReveal: PhoneViewInput[] = [
    phone({ item: KEYED, revealed: REVEAL }),
    phone({ item: KEYED, revealed: REVEAL, answered: { itemId: ITEM.id, submittedAt: NOW } }),
    phone({ item: KEYED, revealed: REVEAL, state: at({ status: "paused" }) }),
    phone({ item: KEYED, revealed: REVEAL, state: initialSessionState(3) }),
    phone({
      item: KEYED,
      revealed: REVEAL,
      state: at({ timer: { seconds: 30, endsAt: NOW - 1, remainingMs: null } }),
    }),
    phone({ item: KEYED, revealed: REVEAL, connection: "reconnecting" }),
  ];

  it.each(beforeReveal.map((input) => [input.state.status, input] as const))(
    "holds no key while %s and not revealed",
    (_status, input) => {
      const view: PhoneView = phoneView(input);
      const wire = JSON.stringify(view);
      for (const secret of secrets) expect(wire).not.toContain(secret);
    },
  );

  it("strips the key from the item even once the answer is showing; the reveal carries it", () => {
    const view = phoneView(phone({ item: KEYED, revealed: REVEAL, state: at({ reveal: true }) }));
    expect(view.phase).toBe("answerShowing");
    if (view.phase !== "answerShowing") return;
    expect(view.item).not.toHaveProperty("answerKey");
    expect(view.item).not.toHaveProperty("rationale");
    expect(view.revealed).toBe(REVEAL);
  });

  it("leaves the item it was given untouched", () => {
    phoneView(phone({ item: KEYED }));
    expect(ITEM).toHaveProperty("answerKey");
  });
});
