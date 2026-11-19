import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { caseStudySchema, itemSchema } from "@/lib/ngn/schemas";
import { ClaudeCallError, type StructuredRequest } from "./claude";
import { NO_USAGE } from "./config";
import { planExtraction } from "./extract";
import { extractCaseStudy, extractQuestions, regionsOf, type UnitCall } from "./extractQuestions";
import { mergeSegments, type MergedQuestion } from "./merge";
import { readSegment } from "./segment";
import { corpusText } from "./testing/segmentRecordings";

/**
 * #343 wired to #344: case study groups and a standalone trend's own chart, on corpus document 07
 * (fictional) and its hand-written recording. The calls answer as the recording says the model did.
 */

interface CaseDraft {
  title: string;
  patient: unknown;
  charts: unknown;
  steps: { stem: string; type: string }[];
}

const NAME = "07-night-shift-case-and-trend.md";
const text = corpusText(NAME);
const recording = JSON.parse(
  readFileSync(
    path.resolve(
      import.meta.dirname,
      `../../../test/ai-import/recordings/${NAME.replace(".md", ".json")}`,
    ),
    "utf8",
  ),
) as {
  questions: { opening: string; type: string; draft: unknown; chart?: unknown }[];
  caseStudies: { draft: CaseDraft }[];
};
const cases = recording.caseStudies.map((entry) => entry.draft);
const opening = (stem: string) => stem.split(/\s+/).slice(0, 20).join(" ");
const drafts = [
  ...cases.flatMap((draft) =>
    draft.steps.map((step) => ({ opening: opening(step.stem), draft: step })),
  ),
  ...recording.questions.map((q) => ({ opening: q.opening, draft: q.draft })),
];

function merged(extra: Record<string, unknown>[] = []): MergedQuestion[] {
  const segment = {
    questions: [
      ...cases.flatMap((draft) =>
        draft.steps.map((step) => ({
          excerpt: opening(step.stem),
          type: step.type,
          caseStudy: { title: draft.title },
          confidence: 0.9,
          instructorNote: false,
          reliesOnImage: false,
          cutOff: false,
          continued: false,
        })),
      ),
      ...recording.questions.map((q) => ({
        excerpt: q.opening,
        type: q.type,
        ownChart: q.chart !== undefined,
        confidence: 0.9,
        instructorNote: false,
        reliesOnImage: false,
        cutOff: false,
        continued: false,
      })),
      ...extra,
    ],
    answers: [],
  };
  const chunk = { position: 0, of: 1, pageFrom: null, pageTo: null };
  return mergeSegments([readSegment(segment, chunk, { type: "text", text })]).questions;
}

const quotedIn = (tag: string, request: StructuredRequest) => {
  const last = request.content.at(-1);
  const ask = last?.type === "text" ? last.text : "";
  return JSON.parse(new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`).exec(ask)?.[1] ?? "{}");
};

/**
 * Answers each request from the recording; `fail` names purposes that throw, and `failStep` makes
 * only that step's chart call throw.
 */
function replay(fail: string[] = [], failStep?: number, refuse?: Error) {
  const purposes: string[] = [];
  const requests: StructuredRequest[] = [];
  const call: UnitCall = vi.fn(async (request, purpose) => {
    purposes.push(purpose);
    requests.push(request);
    if (fail.includes(purpose)) throw new ClaudeCallError("max_tokens", NO_USAGE, 1);
    const properties = (request.schema as { properties: Record<string, unknown> }).properties;
    let value: unknown;
    if ("chart" in properties) {
      const { opens } = quotedIn("question", request) as { opens: string };
      value = recording.questions.find((q) => q.opening === opens)?.chart;
    } else if ("patient" in properties) {
      const { title } = quotedIn("case_study", request) as { title: string };
      const { patient } = cases.find((draft) => draft.title === title)!;
      value = { title, patient };
    } else if ("tabs" in properties) {
      const { title, step } = quotedIn("case_study", request) as { title: string; step: number };
      if (step === failStep) throw refuse ?? new ClaudeCallError("max_tokens", NO_USAGE, 1);
      value = (cases.find((draft) => draft.title === title)!.charts as unknown[])[step - 1];
    } else {
      const asked = quotedIn("questions", request) as { field: string; opens: string }[];
      value = Object.fromEntries(
        asked.map((q) => [
          q.field,
          { draft: drafts.find((d) => d.opening === q.opens)!.draft, sourceErrors: [] },
        ]),
      );
    }
    return { value, usage: NO_USAGE, attempts: 1 };
  });
  return { call, purposes, requests };
}

const document = {
  payload: { type: "text" as const, text },
  kind: "md" as const,
  sourceText: text,
};

describe("extractCaseStudy", () => {
  const questions = merged();
  const regions = regionsOf(questions, text);
  const units = planExtraction(questions);
  const unitOf = (title: string) => {
    const unit = units.find((u) => u.caseStudy === title)!;
    return questions.filter((q) => unit.positions.includes(q.position));
  };

  it("plans one unit per group, and the trend on its own", () => {
    expect(units.map((u) => [u.caseStudy, u.positions.length])).toEqual([
      [cases[0].title, 6],
      [cases[1].title, 3],
      [null, 1],
    ]);
  });

  it("stages six steps as one case study, reading its record a step per call", async () => {
    const { call, purposes, requests } = replay();
    const steps = unitOf(cases[0].title);
    const entries = await extractCaseStudy(call, cases[0].title, steps, document, regions);
    // #604: one call for the title and patient header, and one per step's chart. A single call
    // for all six charts ran past the answer limit on a real-size case study.
    expect(purposes.sort()).toEqual([...Array(7).fill("chart"), "extract", "extract", "extract"]);
    const asked = requests
      .filter((request) => "tabs" in (request.schema as { properties: object }).properties)
      .map((request) => quotedIn("case_study", request) as { step: number; of: number });
    expect(asked.map(({ step, of }) => [step, of]).sort()).toEqual(
      [1, 2, 3, 4, 5, 6].map((step) => [step, 6]),
    );
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry).toMatchObject({
      kind: "case_study",
      type: null,
      position: steps[0].position,
      group: { title: cases[0].title, step: null },
    });
    expect(entry.status).toBe("ready");
    expect(caseStudySchema.safeParse(entry.item).success).toBe(true);
    expect((entry.draft as { steps: unknown[] }).steps).toHaveLength(6);
    expect(entry.reasons.map((r) => r.code)).toContain("source_error");
    // #593: the source shown is the six steps' whole part of the document, not thirty words of
    // step 1; the opening is kept apart, where the duplicate pass and the split look for it.
    expect(entry.opening).toBe(steps[0].excerpt);
    expect(entry.sourceExcerpt.length).toBeGreaterThan(entry.opening.length * 4);
    for (const step of steps)
      expect(entry.sourceExcerpt).toContain(regions.get(step.position)!.trim().slice(0, 40));
    expect(entry.draft).toMatchObject({
      opening: steps[0].excerpt,
      keys: ["shown", "shown", "shown", "shown", "shown", "shown"],
      unchecked: [false, false, false, false, false, false],
    });
  });

  it("stages a group of three as three questions, each with #344's note and its place", async () => {
    const { call, purposes } = replay();
    const steps = unitOf(cases[1].title);
    const entries = await extractCaseStudy(call, cases[1].title, steps, document, regions);
    // A group that is not six is never one case study: its record only says whether one was
    // printed, so the header and the first step's chart are enough (#604).
    expect(purposes.filter((purpose) => purpose === "chart")).toHaveLength(2);
    expect(entries.map((e) => [e.kind, e.group?.step, e.status])).toEqual([
      ["item", 1, "ready"],
      ["item", 2, "ready"],
      ["item", 3, "ready"],
    ]);
    for (const entry of entries) {
      expect(
        entry.reasons.some((r) => r.code === "note" && /A case study has 6/.test(r.message)),
      ).toBe(true);
    }
  });

  it("keeps a case study whose chart call failed, as needs_fix", async () => {
    const { call } = replay(["chart"]);
    const [entry] = await extractCaseStudy(
      call,
      cases[0].title,
      unitOf(cases[0].title),
      document,
      regions,
    );
    expect(entry).toMatchObject({ kind: "case_study", status: "needs_fix", item: null });
    expect(entry.reasons[0].message).toMatch(/patient record could not be read/);
  });

  it("reads six charts for six typed steps, when the group also has an open prompt", async () => {
    const extra = {
      excerpt: "Discuss with a partner how you would explain the insulin drip to the family.",
      type: "not_ngn",
      notNgnReason: "An open discussion prompt.",
      caseStudy: { title: cases[0].title },
      confidence: 0.9,
      instructorNote: false,
      reliesOnImage: false,
      cutOff: false,
      continued: false,
    };
    const all = merged([extra]);
    const unit = planExtraction(all).find((u) => u.caseStudy === cases[0].title)!;
    const steps = all.filter((q) => unit.positions.includes(q.position));
    expect(steps).toHaveLength(7);
    const { call, purposes } = replay();
    const entries = await extractCaseStudy(
      call,
      cases[0].title,
      steps,
      document,
      regionsOf(all, text),
    );
    expect(purposes.filter((purpose) => purpose === "chart")).toHaveLength(7);
    expect(entries.map((e) => [e.kind, e.status])).toContainEqual(["case_study", "ready"]);
  });

  it("lets a refusal under the cap through, instead of calling the record unreadable", async () => {
    const refused = new Error("the reservation was refused");
    const { call } = replay([], 5, refused);
    await expect(
      extractCaseStudy(call, cases[0].title, unitOf(cases[0].title), document, regions),
    ).rejects.toBe(refused);
  });

  it("treats one step's failed chart call as a record that could not be read", async () => {
    const { call } = replay([], 4);
    const [entry] = await extractCaseStudy(
      call,
      cases[0].title,
      unitOf(cases[0].title),
      document,
      regions,
    );
    // Never a record with a step missing: the teacher is told it could not be read.
    expect(entry).toMatchObject({ kind: "case_study", status: "needs_fix", item: null });
    expect(entry.reasons[0].message).toMatch(/patient record could not be read/);
  });

  it("refuses a key no step's part of the document shows", async () => {
    const { call } = replay();
    const [entry] = await extractCaseStudy(
      call,
      cases[0].title,
      unitOf(cases[0].title),
      document,
      new Map(),
    );
    expect(entry).toMatchObject({ status: "needs_fix", item: null });
    expect(entry.reasons[0]).toMatchObject({ code: "unmarked_key" });
    expect(entry.reasons[0].message).toMatch(/^Step 1: /);
    // #593: every step whose key the document does not show is named, each from 1, and the
    // draft says so for the split.
    const unshown = entry.reasons.filter((reason) => reason.code === "unmarked_key");
    expect(unshown.map((reason) => reason.message.slice(0, 8))).toEqual(
      [1, 2, 3, 4, 5, 6].map((step) => `Step ${step}: `),
    );
    expect((entry.draft as { keys: string[] }).keys).toEqual(Array(6).fill("none"));
    // With no part of the document found, the opening is all there is to show.
    expect(entry.sourceExcerpt).toBe(entry.opening);
  });

  // #592: a step keyed only by bold is kept, and the case study says which step to check.
  it("keeps a step whose key is marked only by bold, and names the step to check", async () => {
    const { call } = replay();
    const steps = unitOf(cases[0].title);
    const bold = new Map(regions);
    bold.set(steps[1].position, "Which finding?\n\nA. One\n**B. Two**\nC. Three\n");
    const [entry] = await extractCaseStudy(call, cases[0].title, steps, document, bold);
    expect(entry).toMatchObject({ kind: "case_study", status: "ready" });
    const checks = entry.reasons.filter((reason) => reason.code === "check_key");
    expect(checks).toHaveLength(1);
    expect(checks[0].message).toMatch(
      /^Step 2: The key was read from bold, underlined or coloured/,
    );
  });

  it("stages a step with no NGN type, and a step whose draft failed, on their own", async () => {
    const extra = {
      excerpt: "Discuss with a partner how you would explain the transfusion to the family.",
      type: "not_ngn",
      notNgnReason: "An open discussion prompt.",
      caseStudy: { title: cases[1].title },
      confidence: 0.9,
      instructorNote: false,
      reliesOnImage: false,
      cutOff: false,
      continued: false,
    };
    const all = merged([extra]);
    const unit = planExtraction(all).find((u) => u.caseStudy === cases[1].title)!;
    const steps = all.filter((q) => unit.positions.includes(q.position));
    const { call } = replay();
    const entries = await extractCaseStudy(
      call,
      cases[1].title,
      steps,
      document,
      regionsOf(all, text),
    );
    expect(entries.map((e) => e.status)).toEqual(["ready", "ready", "ready", "not_importable"]);
  });

  it("makes no call for a group of open prompts only", async () => {
    const all = merged().map((q) => ({ ...q, type: null }));
    const { call } = replay();
    const entries = await extractCaseStudy(
      call,
      cases[1].title,
      all.slice(6, 9),
      document,
      new Map(),
    );
    expect(call).not.toHaveBeenCalled();
    expect(entries.every((e) => e.status === "not_importable")).toBe(true);
  });
});

describe("a standalone question with its own chart", () => {
  const questions = merged();
  const trend = questions.filter((q) => q.group === null);

  it("reads the chart in a call of its own and gives the item its own record", async () => {
    const { call, purposes } = replay();
    const [entry] = await extractQuestions(call, trend, document, regionsOf(questions, text));
    expect(purposes.sort()).toEqual(["chart", "extract"]);
    expect(entry.status).toBe("ready");
    const item = itemSchema.parse(entry.item);
    expect(item.ehr?.timePoints.map((t) => t.label)).toEqual(["0800", "1200", "1600"]);
  });

  it("is needs_fix when its chart call fails", async () => {
    const { call } = replay(["chart"]);
    const [entry] = await extractQuestions(call, trend, document, regionsOf(questions, text));
    expect(entry).toMatchObject({ status: "needs_fix", item: null });
    expect(entry.reasons[0].message).toMatch(/patient record could not be read/);
  });
});
