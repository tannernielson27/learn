import { act, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { writeFileSync } from "node:fs";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #414: the live session says what `docs/glossary.md` says, on the teacher's side and the
 * student's. Every screen and state in the area is rendered to HTML and read the way a person
 * reads it (text, aria-labels, alt, title, placeholder), and no retired word may be in it.
 *
 * The question player and its list of questions are stubbed: their own words belong to #415. The
 * stub still prints the label and the busy text this area hands the player, because those are
 * this area's words.
 *
 * Set `LIVE_WORD_COUNTS` to a file path and the visible word count of every screen is written
 * there as JSON. That is how the before and after table on the pull request was measured.
 */

vi.mock("@/components/question/ItemPlayer", () => ({
  ItemPlayer: ({
    label,
    busyLabel,
    submit,
  }: {
    label?: string;
    busyLabel?: string;
    submit: (response: unknown) => Promise<unknown>;
  }) => (
    <div data-testid="player" aria-label={label}>
      {busyLabel}
      {/* No text of its own, so it adds nothing to a word count. */}
      <button type="button" data-testid="send" onClick={() => void submit({}).catch(() => {})} />
    </div>
  ),
}));
vi.mock("@/components/question/SetNav", () => ({ SetNav: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
  notFound: () => {
    throw new Error("not found");
  },
  redirect: () => {
    throw new Error("redirect");
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "learn.test", "x-forwarded-proto": "https" }),
}));
vi.mock("@/lib/observability/reportError", () => ({
  reportClientError: () => {},
  startClientReporting: () => {},
}));
vi.mock("@/lib/authoring/session", () => ({ requireAuthor: async () => ({ supabase: {} }) }));
vi.mock("@/app/join/actions", () => ({ joinLiveSession: async () => ({ status: "idle" }) }));

const reads = vi.hoisted(() => ({
  readHostSession: vi.fn(),
  readSessionReport: vi.fn(),
  listRecentSessions: vi.fn(),
}));
vi.mock("@/lib/supabase/sessions", () => ({ readHostSession: reads.readHostSession }));
vi.mock("@/lib/supabase/sessionReport", () => ({
  readSessionReport: reads.readSessionReport,
  listRecentSessions: reads.listRecentSessions,
}));

import SessionsPage, { metadata as sessionsMeta } from "@/app/author/sessions/page";
import { JoinScreen } from "@/app/join/JoinScreen";
import { metadata as joinCodeMeta } from "@/app/join/[code]/page";
import { metadata as joinMeta } from "@/app/join/page";
import HostError from "@/app/live/[sessionId]/error";
import LiveSessionPage, { metadata as liveMeta } from "@/app/live/[sessionId]/page";
import ReportError from "@/app/live/[sessionId]/report/error";
import SessionReportPage, { metadata as reportMeta } from "@/app/live/[sessionId]/report/page";
import PlayError from "@/app/play/[sessionId]/error";
import { findRetiredTerms, readText, visibleText, wordCount } from "@/lib/copy/retiredTerms";
import {
  LIVE_REFUSALS,
  LiveSessionError,
  NO_TIMER,
  type LiveHostTransport,
  type LiveSessionState,
  type ParticipantItem,
  type RosterEntry,
  type SessionProgress,
} from "@/lib/live";
import * as joinFormCopy from "@/lib/live/joinForm";
import { caseStudyLiveStartMessage } from "@/lib/live/liveStart";
import { positionLabel } from "@/lib/live/positionLabel";
import { buildSessionReport } from "@/lib/live/report";
import { REPORT_FIXTURE } from "@/lib/live/reportFixture";
import { timerAnnouncement } from "@/lib/live/timer";
import { waitingCopy } from "@/lib/live/waiting";
import type { StudentView, SupabaseParticipant } from "@/lib/liveSupabase";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema } from "@/lib/ngn/schemas";
import { toKeylessItem } from "@/lib/ngn/submit";
import { HostLobby } from "./HostLobby";
import { LIVE_BUSY_LABEL, liveSubmitFailure } from "./liveSubmit";
import { SessionList } from "./report/SessionList";
import { SessionReportView } from "./report/SessionReportView";
import { Roster } from "./Roster";
import { StudentPacedRoom } from "./StudentPacedRoom";
import { StudentRoom } from "./StudentRoom";
import { TimerControls } from "./TimerControls";

/** Phrases this area retired that the shared list has no pattern of its own for. */
const LIVE_RETIRED: readonly [string, RegExp][] = [
  ["in the room", /\bin the room\b/],
  ["session code", /\bsession code\b/],
  ["session console", /\bsession console\b/],
  ["your instructor", /\byour instructor\b/],
  ["move the room", /\bmoves? the room\b/],
];

/** Every retired word in what a person reads or hears of `html`. Empty when it is clean. */
function retiredIn(html: string): string[] {
  const read = readText(html);
  const flat = read.toLowerCase().replace(/\s+/g, " ");
  return [
    ...findRetiredTerms(read),
    ...LIVE_RETIRED.filter(([, pattern]) => pattern.test(flat)).map(([phrase]) => `"${phrase}"`),
  ];
}

const SESSION_ID = "00000000-0000-4000-8000-0000000414aa";
const CODE = "AJ4K7P";
const NOW = 1_800_000_000_000;
const ITEM = toKeylessItem(itemSchema.parse(FIXTURES.multiple_choice.canonical)) as ParticipantItem;

const state = (over: Partial<LiveSessionState> = {}): LiveSessionState => ({
  status: "lobby",
  position: null,
  itemCount: 3,
  reveal: false,
  timer: NO_TIMER,
  ...over,
});
const running = (over: Partial<LiveSessionState> = {}) =>
  state({ status: "running", position: 1, ...over });
const paced = (over: Partial<LiveSessionState> = {}) => running({ mode: "student_paced", ...over });

const ROSTER: RosterEntry[] = [
  { participantId: "p-1", displayName: "Ana Reyes", joinedAt: 1, present: true },
  { participantId: "p-2", displayName: "Ben Osei", joinedAt: 2, present: false },
];
const PROGRESS: SessionProgress = {
  answered: [2, 1, 0],
  rows: [
    { participantId: "p-1", displayName: "Ana Reyes", positions: [1, 2] },
    { participantId: "p-2", displayName: "Ben Osei", positions: [1] },
  ],
};

/** Lets effects, resolved promises and the first poll land before the HTML is read. */
const settle = () => act(async () => {});

interface HostOptions {
  caseStudy?: boolean;
  offline?: boolean;
  progress?: SessionProgress;
}

/** The teacher's live session on `initial`, with a transport that answers but never moves. */
async function host(initial: LiveSessionState, options: HostOptions = {}) {
  const never = () => new Promise<never>(() => {});
  const transport = {
    open: async () => {
      if (options.offline) throw new Error("no socket");
      return {
        sessionId: SESSION_ID,
        code: CODE,
        mode: initial.mode ?? "instructor_paced",
        roster: ROSTER,
        aggregate: { position: 1, responded: 2, present: 3 },
        state: initial,
        item: null,
      };
    },
    close: async () => {},
    onSessionState: () => () => {},
    onPresence: () => () => {},
    onAggregate: () => () => {},
    aggregate: async () => ({ position: 1, responded: 2, present: 3 }),
    results: async () => null,
    progress: async () => options.progress ?? null,
    serverNow: () => NOW,
    start: never,
    end: never,
    reveal: never,
  } as unknown as LiveHostTransport;
  const view = render(
    <HostLobby
      sessionId={SESSION_ID}
      title="Cardiac basics"
      code={CODE}
      studentUrl={`https://learn.test/join/${CODE}`}
      qrCode={null}
      initial={initial}
      connect={() => transport}
      caseStudy={options.caseStudy}
    />,
  );
  await settle();
  return view;
}

async function hostPressing(initial: LiveSessionState, button: string | RegExp) {
  const view = await host(initial);
  await userEvent.click(view.getByRole("button", { name: button }));
  await settle();
  return view.container.innerHTML;
}

type Room = typeof StudentRoom;

/** A student's phone on `initial`, then on whatever `views` the transport pushes. */
async function phone(
  Component: Room,
  initial: LiveSessionState,
  views: Partial<StudentView>[] = [],
  connection?: "reconnecting",
  refuseWith?: LiveSessionError,
) {
  let pushView: (view: StudentView) => void = () => {};
  let setConnection: (status: "reconnecting", rejoined: boolean) => void = () => {};
  const transport = {
    resume: async () => ({ state: initial, item: null, answered: null, revealed: null }),
    leave: async () => {},
    onStudentView: (listener: typeof pushView) => {
      pushView = listener;
      return () => {};
    },
    onPresence: () => () => {},
    onConnection: (listener: typeof setConnection) => {
      setConnection = listener;
      return () => {};
    },
    submit: async () => {
      throw refuseWith ?? new Error("not driven");
    },
    serverNow: () => NOW,
  } as unknown as SupabaseParticipant;
  const view = render(
    <Component
      sessionId={SESSION_ID}
      title="Cardiac basics"
      displayName="Ana Reyes"
      participantId="00000000-0000-4000-8000-0000000414bb"
      joinedAt={1000}
      initial={initial}
      channel={{ token: "channel-token", expiresAt: 0 }}
      connect={() => transport}
    />,
  );
  await settle();
  for (const next of views) {
    act(() => pushView({ state: initial, item: null, answered: null, revealed: null, ...next }));
  }
  if (connection) act(() => setConnection(connection, false));
  if (refuseWith) await userEvent.click(view.getByTestId("send"));
  await settle();
  return view.container.innerHTML;
}

const ANSWERED = {
  itemId: ITEM.id,
  submittedAt: NOW,
  response: { type: "multiple_choice" as const, optionId: "opt_a" },
};
const KEY = { answerKey: { optionId: "opt_a" }, rationale: {}, scoring: {} } as never;
const pacedEntry = (over: object = {}) => ({
  position: 1,
  item: ITEM,
  answered: null,
  revealed: null,
  ...over,
});

const html = async (element: ReactElement) => renderToStaticMarkup(element);
const boundary = (Boundary: typeof HostError) =>
  html(
    <Boundary
      error={Object.assign(new Error("x"), { digest: "4031337" })}
      retry={() => {}}
      reset={() => {}}
    />,
  );

const report = buildSessionReport(REPORT_FIXTURE);
const reportView = (view: "students" | "items" | "steps", data = report) =>
  html(
    <SessionReportView
      sessionId={SESSION_ID}
      title="Cardiac basics"
      closedAt="2026-09-22T10:40:00Z"
      report={data}
      view={view}
    />,
  );

const summary = {
  id: SESSION_ID,
  title: "Cardiac basics",
  status: "ended" as const,
  openedAt: "2026-09-22T10:00:00Z",
  closedAt: "2026-09-22T10:40:00Z",
  participantCount: 24,
};
const hostSession = {
  id: SESSION_ID,
  title: "Cardiac basics",
  code: CODE,
  status: "lobby" as const,
  mode: "instructor_paced" as const,
  itemCount: 3,
  position: null,
  reveal: false,
  timer: NO_TIMER,
  openedAt: "2026-09-22T10:00:00Z",
  closedAt: null,
  caseStudy: false,
};
const params = { params: Promise.resolve({ sessionId: SESSION_ID }) } as never;

/** Every screen and state in the area, by the name the pull request's table uses. */
const SCREENS: [string, () => Promise<string>][] = [
  // The teacher's live session.
  [
    "teacher: live session page, lobby (server render)",
    async () => {
      reads.readHostSession.mockResolvedValue(hostSession);
      return html(await LiveSessionPage(params));
    },
  ],
  ["teacher: lobby", async () => (await host(state())).container.innerHTML],
  ["teacher: question open", async () => (await host(running())).container.innerHTML],
  [
    "teacher: question open, timer running",
    async () =>
      (await host(running({ timer: { seconds: 60, endsAt: NOW + 30_000, remainingMs: null } })))
        .container.innerHTML,
  ],
  [
    "teacher: answer showing",
    async () => (await host(running({ reveal: true }))).container.innerHTML,
  ],
  [
    "teacher: paused",
    async () => (await host(state({ status: "paused", position: 2 }))).container.innerHTML,
  ],
  [
    "teacher: case study step",
    async () => (await host(running({ itemCount: 6 }), { caseStudy: true })).container.innerHTML,
  ],
  [
    "teacher: student-paced, progress board",
    async () => (await host(paced(), { progress: PROGRESS })).container.innerHTML,
  ],
  ["teacher: ended", async () => (await host(state({ status: "ended" }))).container.innerHTML],
  [
    "teacher: live updates not running",
    async () => (await host(state(), { offline: true })).container.innerHTML,
  ],
  ["teacher: results hidden", () => hostPressing(running(), "Hide results")],
  ["teacher: confirm end", () => hostPressing(running(), /^End/)],
  ["teacher: confirm show answers (student-paced)", () => hostPressing(paced(), "Show answers")],
  ["teacher: roster", () => html(<Roster roster={ROSTER} />)],
  ["teacher: roster, nobody yet", () => html(<Roster roster={[]} />)],
  [
    "teacher: timer, before the start",
    () =>
      html(<TimerControls state={state()} busy={false} onChoose={() => {}} onCommand={() => {}} />),
  ],
  [
    "teacher: timer, question with a clock",
    () =>
      html(
        <TimerControls
          state={running({ timer: { seconds: 60, endsAt: NOW + 30_000, remainingMs: null } })}
          busy={false}
          onChoose={() => {}}
          onCommand={() => {}}
        />,
      ),
  ],
  ["teacher: live session page failed", () => boundary(HostError)],
  // The report and the list.
  ["report: students", () => reportView("students")],
  ["report: questions", () => reportView("items")],
  ["report: clinical judgment steps", () => reportView("steps")],
  [
    "report: nobody joined",
    () => reportView("students", buildSessionReport({ ...REPORT_FIXTURE, participants: [] })),
  ],
  [
    "report: no step tagged",
    () =>
      reportView(
        "steps",
        buildSessionReport({
          ...REPORT_FIXTURE,
          items: REPORT_FIXTURE.items.map((item) => ({ ...item, cjmmStep: null })),
        }),
      ),
  ],
  [
    "report: live session still open",
    async () => {
      reads.readSessionReport.mockResolvedValue({
        session: { ...summary, status: "running", closedAt: null },
        input: REPORT_FIXTURE,
      });
      return html(
        await SessionReportPage({
          ...(params as object),
          searchParams: Promise.resolve({}),
        } as never),
      );
    },
  ],
  ["report: failed to load", () => boundary(ReportError)],
  [
    "list: live sessions",
    async () => {
      reads.listRecentSessions.mockResolvedValue([
        summary,
        { ...summary, id: `${SESSION_ID}b`, title: "Respiratory drill", status: "lobby" },
      ]);
      return html(await SessionsPage());
    },
  ],
  ["list: none yet", () => html(<SessionList sessions={[]} />)],
  [
    "list: could not be loaded",
    async () => {
      reads.listRecentSessions.mockResolvedValue(null);
      return html(await SessionsPage());
    },
  ],
  // The student's side.
  ["student: join", () => html(<JoinScreen code="" />)],
  ["student: join, code filled in", () => html(<JoinScreen code={CODE} />)],
  ["student: lobby", () => phone(StudentRoom, state())],
  ["student: paused", () => phone(StudentRoom, state({ status: "paused", position: 2 }))],
  ["student: ended", () => phone(StudentRoom, state({ status: "ended" }))],
  ["student: waiting for the question", () => phone(StudentRoom, running())],
  ["student: waiting for the answer", () => phone(StudentRoom, running({ reveal: true }))],
  ["student: answering", () => phone(StudentRoom, running(), [{ state: running(), item: ITEM }])],
  [
    "student: answer sent",
    () => phone(StudentRoom, running(), [{ state: running(), item: ITEM, answered: ANSWERED }]),
  ],
  [
    "student: answer showing, did not answer",
    () =>
      phone(StudentRoom, running({ reveal: true }), [
        {
          state: running({ reveal: true }),
          item: ITEM,
          revealed: { itemId: ITEM.id, position: 1, reveal: KEY, score: null },
        },
      ]),
  ],
  [
    "student: answer too late",
    () =>
      phone(
        StudentRoom,
        running(),
        [{ state: running(), item: ITEM }],
        undefined,
        new LiveSessionError("time_up"),
      ),
  ],
  ["student: reconnecting", () => phone(StudentRoom, state(), [], "reconnecting")],
  ["student: screen failed", () => boundary(PlayError)],
  ["student-paced: lobby", () => phone(StudentPacedRoom, state({ mode: "student_paced" }))],
  ["student-paced: loading", () => phone(StudentPacedRoom, paced())],
  ["student-paced: paused", () => phone(StudentPacedRoom, paced({ status: "paused" }))],
  [
    "student-paced: answering",
    () => phone(StudentPacedRoom, paced(), [{ state: paced(), paced: [pacedEntry()] }]),
  ],
  [
    "student-paced: answer sent",
    () =>
      phone(StudentPacedRoom, paced(), [
        { state: paced(), paced: [pacedEntry({ answered: ANSWERED })] },
      ]),
  ],
  [
    "student-paced: answers showing",
    () =>
      phone(StudentPacedRoom, paced({ reveal: true }), [
        {
          state: paced({ reveal: true }),
          paced: [
            pacedEntry({ revealed: { itemId: ITEM.id, position: 1, reveal: KEY, score: null } }),
          ],
        },
      ]),
  ],
];

const counts: Record<string, number> = {};

// "Hide results" is remembered in the browser; each screen starts from a fresh one.
beforeEach(() => {
  window.localStorage.clear();
  // Stored "showing" wins over the page's own memory of an earlier screen's choice.
  window.localStorage.setItem(`learn.hostResults.hidden.${SESSION_ID}`, "0");
});

afterAll(() => {
  const target = process.env.LIVE_WORD_COUNTS;
  if (target) writeFileSync(target, `${JSON.stringify(counts, null, 2)}\n`);
});

describe("the check itself (control)", () => {
  it.each([
    ["the old count on a student's phone", "<p>12 in the room</p>"],
    ["the old join form label", "<label>Session code</label>"],
    ["an old aria-label", '<button aria-label="Go to item 3">3</button>'],
    ["the old report tab", "<a>CJMM steps</a>"],
    ["the old error headline", "<h1>The session console stopped working.</h1>"],
    ["the old waiting line", "<p>Wait here — your instructor starts the session.</p>"],
    ["the old button", "<button>End session</button>"],
  ])("fails on %s", (_, old) => {
    expect(retiredIn(old)).not.toEqual([]);
  });

  it("passes the words the glossary keeps", () => {
    expect(
      retiredIn(
        '<h1>Join a live session</h1><p>12 in this session</p><button aria-label="Go to question 3">3</button>',
      ),
    ).toEqual([]);
  });
});

describe("no retired word on any live session screen", () => {
  it.each(SCREENS)("%s", async (name, build) => {
    const markup = await build();
    counts[name] = wordCount(visibleText(markup));
    expect(markup.length).toBeGreaterThan(0);
    expect(retiredIn(markup)).toEqual([]);
  });

  /** Proof that a state's builder reached the state it is named for, not an empty or wrong one. */
  const REACHED: [string, string][] = [
    ["teacher: lobby", "Waiting to start"],
    ["teacher: roster, nobody yet", "Nobody has joined yet."],
    ["teacher: question open", "Question 1 of 3"],
    ["teacher: case study step", "Step 1 of 6: Recognize Cues"],
    ["teacher: student-paced, progress board", "Ana Reyes"],
    ["teacher: ended", "Open the report"],
    ["teacher: live updates not running", "Live updates stopped."],
    ["teacher: results hidden", "Results are hidden."],
    ["teacher: confirm end", "End this live session?"],
    ["teacher: confirm show answers (student-paced)", "Show answers for all 3 questions?"],
    ["report: live session still open", "Open the live session"],
    ["list: could not be loaded", "could not be loaded"],
    ["student: lobby", "You are in."],
    ["student: answer sent", "Answer sent."],
    ["student: answer showing, did not answer", "You did not answer this question."],
    ["student: answer too late", "Your answer was not taken."],
    ["student: reconnecting", "Reconnecting."],
    ["student-paced: loading", "Loading the questions."],
    ["student-paced: answer sent", "Answer sent."],
    ["student-paced: answers showing", "The answers are showing."],
  ];
  it.each(REACHED)("%s reaches its state", async (name, shown) => {
    const build = SCREENS.find(([each]) => each === name)?.[1];
    expect(build).toBeDefined();
    expect(visibleText(await (build as () => Promise<string>)())).toContain(shown);
  });

  it("names every screen once, so the word-count table has no gaps", () => {
    expect(new Set(SCREENS.map(([name]) => name)).size).toBe(SCREENS.length);
  });
});

describe("no retired word in the page titles", () => {
  it.each([
    ["/live/[sessionId]", liveMeta.title],
    ["/live/[sessionId]/report", reportMeta.title],
    ["/author/sessions", sessionsMeta.title],
    ["/join", joinMeta.title],
    ["/join/[code]", joinCodeMeta.title],
  ])("%s", (_, title) => {
    expect(typeof title).toBe("string");
    expect(retiredIn(`<title>${String(title)}</title>`)).toEqual([]);
  });

  // `src/app/play/[sessionId]/page.tsx` still titles the tab "Session". PR #428 rewrites that
  // file, so its title changes once that has merged.
  it.todo("/play/[sessionId]");
});

describe("no retired word in the sentences the screens are handed", () => {
  const states: LiveSessionState[] = [
    state(),
    running(),
    running({ reveal: true }),
    state({ status: "paused", position: 2 }),
    state({ status: "ended" }),
    paced(),
  ];
  const sentences: [string, string[]][] = [
    ["a live session's refusals", Object.values(LIVE_REFUSALS)],
    [
      "the join form's refusals",
      Object.values(joinFormCopy).flatMap((value) =>
        typeof value === "string"
          ? [value]
          : typeof value === "object" && value !== null
            ? Object.values(value as Record<string, unknown>).filter(
                (each): each is string => typeof each === "string",
              )
            : [],
      ),
    ],
    ["the waiting lines", states.flatMap((each) => Object.values(waitingCopy(each)))],
    [
      "the position",
      [
        positionLabel(running(), { caseStudy: false, cjmmStep: null }),
        positionLabel(running({ itemCount: 6 }), { caseStudy: true, cjmmStep: 2 }),
        positionLabel(running({ itemCount: 6 }), { caseStudy: true, cjmmStep: 9 }),
      ],
    ],
    ["why a case study could not start", ["empty", "gone", "other"].map(caseStudyLiveStartMessage)],
    ["sending an answer", [LIVE_BUSY_LABEL, liveSubmitFailure(new Error("dropped"))]],
    ["the timer's announcements", [30_000, 10_000, 0].map(timerAnnouncement)],
  ].map(([name, lines]) => [
    name as string,
    (lines as unknown[]).filter((line): line is string => typeof line === "string"),
  ]);

  it.each(sentences)("%s", (_, lines) => {
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.flatMap((line) => retiredIn(`<p>${line}</p>`))).toEqual([]);
  });
});
