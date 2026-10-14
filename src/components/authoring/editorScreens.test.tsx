import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findRetiredTerms, visibleWordCount, type RetiredTermHit } from "@/lib/copy/retiredTerms";
import { emptyEhrForm, ehrFormFromStored } from "@/lib/authoring/forms/ehr";
import { allFixtures, FIXTURES, sampleCaseStudy, sampleTrendItem } from "@/lib/ngn/fixtures";
import type { ItemType } from "@/lib/ngn/labels";
import type { CjmmStep } from "@/lib/ngn/types";
import { validateCaseStudy, validateItem } from "@/lib/ngn/validate";
import { toCaseStudyRow, toItemRow } from "@/lib/supabase/itemRows";

/**
 * #413: where a teacher writes, rendered with the real editors and searched for the words
 * docs/glossary.md retired, in visible text, `aria-label`, `title`, `placeholder`, `alt` and the
 * page title. The shared list is `src/lib/copy/retiredTerms.ts`; the words these screens used to
 * say on top of it are below.
 *
 * The question and case study players drawn in the previews are the student's screens (#415),
 * so they are stubbed here: their words are checked there, and they are not the editor's words.
 *
 * Run with `LEARN_WORD_COUNT=1 --silent=false --reporter=verbose` to print the word counts.
 */

const LOCAL_TERMS: readonly { say: string; pattern: RegExp }[] = [
  // A patient record's parts are tabs.
  { say: "tab", pattern: /\bsections?\b/i },
  // "Record" alone; "patient record" in full.
  { say: "patient record", pattern: /(?<!\bpatient )\brecords?\b/i },
  // "Step" alone means one of the six, so it carries its number; the thing in it is a question.
  // An ordered response's own steps are the one exception ("Give a point for each step...").
  { say: "Step 2, or the question", pattern: /(?<!\bjudgment )\bstep\b(?! ?\d)/i },
];

// Written by the teacher, not the interface: the sample patient is "on room air".
const SAMPLE_CONTENT = /\broom air\b/gi;

function findLocalTerms(html: string, allowSteps = false): RetiredTermHit[] {
  const terms = allowSteps
    ? LOCAL_TERMS.filter((term) => term.say !== LOCAL_TERMS[2]!.say)
    : LOCAL_TERMS;
  const texts = [
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " "),
    ...[...html.matchAll(/\s(?:aria-label|title|placeholder|alt)="([^"]*)"/gi)].map(
      (match) => match[1] ?? "",
    ),
  ];
  return texts.flatMap((text) =>
    terms.flatMap((term) =>
      [...text.matchAll(new RegExp(term.pattern.source, "gi"))].map((match) => ({
        found: match[0],
        say: term.say,
        context: text.slice(Math.max(0, (match.index ?? 0) - 30), (match.index ?? 0) + 40),
      })),
    ),
  );
}

/** Every old word in a render, leaving out what the teacher wrote: field contents and samples. */
function allHits(html: string, title = "", allowSteps = false): RetiredTermHit[] {
  const shown = html
    .replace(/(<textarea\b[^>]*>)[\s\S]*?<\/textarea>/gi, "$1</textarea>")
    .replace(SAMPLE_CONTENT, " ");
  return [
    ...findRetiredTerms(shown, title),
    ...findLocalTerms(shown, allowSteps),
    ...findLocalTerms(title, allowSteps),
  ];
}

const ITEM = "00000000-0000-4000-8000-0000000000e1";
const BANK = "00000000-0000-4000-8000-0000000000b1";
const CASE = "00000000-0000-4000-8000-0000000000c5";

const state = vi.hoisted(() => ({
  itemRow: null as Record<string, unknown> | null,
  caseRow: null as Record<string, unknown> | null,
}));

const ok = () => vi.fn(async () => ({ ok: true }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/author",
}));
vi.mock("@/app/author/items/[itemId]/actions", () => new Proxy({}, { get: () => ok() }));
vi.mock("@/app/author/case-studies/[caseStudyId]/actions", () => ({
  publishCaseStudyAction: ok(),
  saveCaseStudyRecord: ok(),
  startStepItem: vi.fn(async () => ({ error: "" })),
}));
vi.mock("@/app/author/archiveActions", () => ({
  archiveCaseStudyAction: ok(),
  archiveItemAction: ok(),
  restoreCaseStudyAction: ok(),
  restoreItemAction: ok(),
}));
vi.mock("@/app/author/duplicateActions", () => ({
  duplicateCaseStudyAction: ok(),
  duplicateItemAction: ok(),
}));
vi.mock("@/app/live/actions", () => ({ startCaseStudyLiveSession: ok() }));
vi.mock("@/app/author/actions", () => ({ createItem: vi.fn(async () => ({ error: "" })) }));
// The players are the student's screens (#415): see the note at the top.
vi.mock("@/components/question/ItemPlayer", () => ({
  ItemPlayer: () => <p>Player</p>,
}));
vi.mock("@/components/case-study/CaseStudyPlayer", () => ({
  CaseStudyPlayer: () => <p>Player</p>,
}));
vi.mock("@/components/authoring/PlayItem", () => ({ PlayItem: () => <p>Player</p> }));
vi.mock("@/components/ehr/EhrContent", async (original) => ({
  ...(await original<typeof import("@/components/ehr/EhrContent")>()),
  EhrContent: () => <p>Patient record</p>,
}));

// The editors load with next/dynamic on the page; here they load at once.
vi.mock("@/components/authoring/ItemEditorLoader", async () => {
  const { SyncItemEditor } = await import("./testing/syncItemEditor");
  return { ItemEditorLoader: SyncItemEditor };
});
vi.mock("@/components/authoring/EhrEditorLoader", async () => {
  const { EhrEditor } = await import("./EhrEditor");
  return {
    EhrEditorLoader: ({ initialValues }: { initialValues: never }) => (
      <EhrEditor initialValues={initialValues} onSave={async () => ({ ok: true })} />
    ),
  };
});

function from(table: string) {
  const builder: Record<string, unknown> = {};
  for (const step of ["select", "eq", "order"]) builder[step] = () => builder;
  builder.limit = async () => ({ data: [], error: null });
  builder.maybeSingle = async () => ({
    data:
      table === "items"
        ? state.itemRow
        : table === "case_studies"
          ? state.caseRow
          : { id: BANK, name: "Cardiac week" },
    error: null,
  });
  return builder;
}
vi.mock("@/lib/authoring/session", () => ({
  requireAuthor: async () => ({ supabase: { from }, orgId: "org", userId: "user" }),
}));

const { SyncItemEditor } = await import("./testing/syncItemEditor");
const { EhrEditor } = await import("./EhrEditor");
const { StepItemPanel } = await import("./StepItemPanel");
const { CreateCaseStudyForm } = await import("./CreateCaseStudyForm");
const { ItemEditorHostContext } = await import("./ItemEditorHost");
const itemPage = await import("@/app/author/items/[itemId]/page");
const playPage = await import("@/app/author/items/[itemId]/play/page");
const newPage = await import("@/app/author/banks/[bankId]/new/page");
const casePage = await import("@/app/author/case-studies/[caseStudyId]/page");
const { editorFor } = await import("./editorFor");

function itemRow(input: unknown, status = "published") {
  const result = validateItem(input);
  if (!result.ok) throw new Error("fixture must be valid");
  return { ...toItemRow(result.value), id: ITEM, bank_id: BANK, status };
}

function caseRow(status = "draft", stepsPlaced = 6, published = true) {
  const caseStudy = validateCaseStudy(sampleCaseStudy);
  if (!caseStudy.ok) throw new Error("sample case study must be valid");
  const row = toCaseStudyRow(caseStudy.value);
  return {
    id: CASE,
    bank_id: BANK,
    title: row.title,
    tags: row.tags,
    status,
    ehr: row.ehr,
    case_study_items: row.items.slice(0, stepsPlaced).map((item, index) => ({
      position: index + 1,
      item_id: `item_${index + 1}`,
      items: { ...item, id: `item_${index + 1}`, status: published ? "published" : "draft" },
    })),
  };
}

const drawItemPage = () =>
  itemPage.default({
    params: Promise.resolve({ itemId: ITEM }),
  } as Parameters<typeof itemPage.default>[0]);
const drawCasePage = () =>
  casePage.default({
    params: Promise.resolve({ caseStudyId: CASE }),
    searchParams: Promise.resolve({}),
  } as Parameters<typeof casePage.default>[0]);

interface Screen {
  name: string;
  title?: unknown;
  draw: () => Promise<ReactElement> | ReactElement;
  /** Counted for the pull request's table. */
  counted?: boolean;
  /** An ordered response's steps are its own word, not the case study's. */
  allowSteps?: boolean;
  setup?: () => void;
}

const editorScreens: Screen[] = allFixtures.flatMap((fixture) => [
  {
    allowSteps: fixture.type === "ordered_response",
    name: `editor, ${fixture.type}, written`,
    counted: true,
    draw: () => {
      const editor = editorFor(ITEM, fixture.type, {
        ...(itemRow(fixture.canonical).content as object),
        ...fixture.canonical,
      });
      if (!editor) throw new Error("no editor");
      return <SyncItemEditor {...editor} />;
    },
  },
  {
    allowSteps: fixture.type === "ordered_response",
    name: `editor, ${fixture.type}, new`,
    counted: true,
    draw: () => {
      const editor = editorFor(ITEM, fixture.type as ItemType, { type: fixture.type });
      if (!editor) throw new Error("no editor");
      return <SyncItemEditor {...editor} />;
    },
  },
  {
    allowSteps: fixture.type === "ordered_response",
    name: `editor, ${fixture.type}, new, in a case study`,
    draw: () => {
      const editor = editorFor(ITEM, fixture.type as ItemType, { type: fixture.type });
      if (!editor) throw new Error("no editor");
      return (
        <ItemEditorHostContext.Provider value={{ inCaseStudy: true, published: true }}>
          <SyncItemEditor {...editor} />
        </ItemEditorHostContext.Provider>
      );
    },
  },
]);

const SCREENS: Screen[] = [
  {
    name: "/author/items/[itemId], published",
    title: itemPage.metadata.title,
    counted: true,
    setup: () => {
      state.itemRow = itemRow(FIXTURES.multiple_choice.canonical);
    },
    draw: drawItemPage,
  },
  {
    name: "/author/items/[itemId], archived",
    title: itemPage.metadata.title,
    counted: true,
    setup: () => {
      state.itemRow = itemRow(FIXTURES.multiple_choice.canonical, "archived");
    },
    draw: drawItemPage,
  },
  {
    name: "/author/items/[itemId], with a patient record",
    title: itemPage.metadata.title,
    counted: true,
    setup: () => {
      state.itemRow = itemRow(sampleTrendItem, "draft");
    },
    draw: drawItemPage,
  },
  {
    name: "/author/items/[itemId], with no patient record",
    title: itemPage.metadata.title,
    setup: () => {
      state.itemRow = itemRow(FIXTURES.matrix_multiple_choice.canonical, "draft");
    },
    draw: drawItemPage,
  },
  {
    name: "/author/items/[itemId]/play",
    title: playPage.metadata.title,
    counted: true,
    setup: () => {
      state.itemRow = itemRow(FIXTURES.multiple_choice.canonical);
    },
    draw: () =>
      playPage.default({
        params: Promise.resolve({ itemId: ITEM }),
      } as Parameters<typeof playPage.default>[0]),
  },
  {
    name: "/author/items/[itemId]/play, cannot be played",
    title: playPage.metadata.title,
    setup: () => {
      state.itemRow = { ...itemRow(FIXTURES.multiple_choice.canonical), content: {} };
    },
    draw: () =>
      playPage.default({
        params: Promise.resolve({ itemId: ITEM }),
      } as Parameters<typeof playPage.default>[0]),
  },
  {
    name: "/author/banks/[bankId]/new",
    title: newPage.metadata.title,
    counted: true,
    draw: () =>
      newPage.default({
        params: Promise.resolve({ bankId: BANK }),
      } as Parameters<typeof newPage.default>[0]),
  },
  ...editorScreens,
  {
    name: "/author/case-studies/[caseStudyId], every step ready",
    title: casePage.metadata.title,
    counted: true,
    setup: () => {
      state.caseRow = caseRow();
    },
    draw: drawCasePage,
  },
  {
    name: "/author/case-studies/[caseStudyId], new",
    title: casePage.metadata.title,
    counted: true,
    setup: () => {
      state.caseRow = { ...caseRow("draft", 0), ehr: { patient: {}, tabs: [] } };
    },
    draw: drawCasePage,
  },
  {
    name: "/author/case-studies/[caseStudyId], steps in draft",
    title: casePage.metadata.title,
    setup: () => {
      state.caseRow = caseRow("draft", 4, false);
    },
    draw: drawCasePage,
  },
  {
    name: "/author/case-studies/[caseStudyId], published",
    title: casePage.metadata.title,
    setup: () => {
      state.caseRow = caseRow("published");
    },
    draw: drawCasePage,
  },
  {
    name: "/author/case-studies/[caseStudyId], archived",
    title: casePage.metadata.title,
    counted: true,
    setup: () => {
      state.caseRow = caseRow("archived");
    },
    draw: drawCasePage,
  },
  {
    name: "patient record editor, filled",
    counted: true,
    draw: () => (
      <EhrEditor
        initialValues={ehrFormFromStored(sampleCaseStudy.ehr)}
        onSave={async () => ({ ok: true })}
      />
    ),
  },
  {
    name: "patient record editor, new",
    counted: true,
    draw: () => <EhrEditor initialValues={emptyEhrForm()} onSave={async () => ({ ok: true })} />,
  },
  {
    name: "New case study form",
    draw: () => <CreateCaseStudyForm action={async () => ({ status: "idle" })} />,
  },
];

const counts: [screen: string, words: number][] = [];

beforeEach(() => {
  state.itemRow = itemRow(FIXTURES.multiple_choice.canonical);
  state.caseRow = caseRow();
});
afterEach(cleanup);
afterAll(() => {
  if (!process.env.LEARN_WORD_COUNT) return;
  const rows = counts.map(([name, words]) => `| ${name} | ${words} |`).join("\n");
  console.info(`\n| Screen | Visible words |\n| --- | --- |\n${rows}\n`);
});

describe("where a teacher writes, the glossary's words are used (#413)", () => {
  it.each(SCREENS)("$name", async ({ name, title, draw, setup, counted, allowSteps }) => {
    setup?.();
    const { container } = render(await draw());
    const html = container.innerHTML;
    if (counted) counts.push([name, visibleWordCount(html)]);
    expect(html.length).toBeGreaterThan(200);
    expect(allHits(html, title ? String(title) : "", allowSteps)).toEqual([]);
  });

  it("a step's question, asked to change its format", async () => {
    render(
      <StepItemPanel caseStudyId={CASE} position={2 as CjmmStep} typeLabel="Matrix Multiple Choice">
        <p>Editor</p>
      </StepItemPanel>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Change format" }));
    expect(allHits(document.body.innerHTML)).toEqual([]);
  });
});

describe("the check can fail", () => {
  it("finds the old words in text, labels and titles", () => {
    const old =
      '<h2>Record</h2><button aria-label="Add section">+</button><p title="Edit item">Step</p>';
    const found = allHits(old, "New item").map((hit) => `${hit.found}: ${hit.context.trim()}`);
    expect(found.sort()).toEqual(
      [
        "item: New item",
        "item: Edit item",
        "Record: Record + Step",
        "Step: Record + Step",
        "section: Add section",
      ].sort(),
    );
  });

  it("leaves the approved forms alone", () => {
    const fine =
      "<p>Patient record</p><p>Step 2 of 6: Analyze Cues</p><p>3 of 6 steps ready</p>" +
      "<p>Clinical judgment step</p><button>Add tab</button>";
    expect(allHits(fine)).toEqual([]);
  });
});
