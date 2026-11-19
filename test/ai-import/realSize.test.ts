import { describe, expect, it } from "vitest";
import { SEGMENT_MAX_TOKENS } from "@/lib/aiImport/config";
import { openingKey } from "@/lib/aiImport/sourceText";
import { CHECK_FORMAT_KEY, CHECK_KEY, type StagedEntry } from "@/lib/aiImport/stage";
import type { CaseStudy, ItemInput } from "@/lib/ngn/schemas";
import {
  ANSWER_KEY_HEADING,
  LONG_BANK_MD,
  SIXTY_DOCX,
  SIXTY_PDF,
  sixtyPdfLayout,
} from "./corpus/generate/bankDocuments";
import {
  CASE_STUDY_MD,
  CASE_TITLE,
  caseStudyKeys,
  caseStudyOpenings,
  caseStudyStems,
} from "./corpus/generate/caseStudy";
import { FORMATTING_DOCX } from "./corpus/generate/formatting";
import { faithfulModel, numberedScript, type FaithfulModel, type Script } from "./faithfulModel";
import { asItem, loadExpected, loadRecordings, type ExpectedImportable } from "./files";
import {
  corpusFile,
  extractPass,
  importDocument,
  segmentPass,
  type Imported,
} from "./productImport";
import { signatureOf } from "./signature";

/**
 * The real-size documents (#594) through the product's own requests, `segmentChunk` for each
 * chunk and `extractUnit` for each unit (`productImport.ts`), with a scripted model that answers
 * each request as a faithful model would (`faithfulModel.ts`). `corpus.test.ts` scores what a
 * model returned; this holds what the product does with it at the size teachers upload: nothing
 * lost or staged twice where a document was cut, a case study put back together, a key read from
 * formatting kept with a check, and a chunk too dense for one answer read in halves.
 */

const recordings = loadRecordings();
const expected = loadExpected();

interface RecordedDraft {
  stem: string;
  type: string;
}

interface RecordedCase {
  title: string;
  patient: unknown;
  charts: unknown;
  steps: RecordedDraft[];
}

const recordingOf = (name: string) => {
  const recording = recordings.get(name);
  if (!recording) throw new Error(`no recording for ${name}`);
  return recording;
};

function caseScript(name: string): Script {
  const { title, patient, charts, steps } = recordingOf(name).caseStudies[0].draft as RecordedCase;
  const openings = caseStudyOpenings();
  return {
    caseStudy: { title, patient, charts },
    questions: steps.map((step, index) => ({
      opening: openings[index],
      stem: step.stem,
      number: `Question ${index + 1}`,
      type: step.type,
      draft: step,
      caseStudy: { title, step: index + 1 },
    })),
  };
}

const SCRIPTS: Record<string, Script> = {
  [SIXTY_DOCX]: numberedScript(recordingOf(SIXTY_DOCX)),
  [LONG_BANK_MD]: numberedScript(recordingOf(LONG_BANK_MD), {
    answerKeyHeading: ANSWER_KEY_HEADING,
  }),
  [FORMATTING_DOCX]: numberedScript(recordingOf(FORMATTING_DOCX)),
  [CASE_STUDY_MD]: caseScript(CASE_STUDY_MD),
  [SIXTY_PDF]: numberedScript(recordingOf(SIXTY_PDF), {}, sixtyPdfLayout().pageOf),
};

/** Each document is imported once with the faithful model, and the tests read what came of it. */
const imports = new Map<string, Promise<{ imported: Imported; model: FaithfulModel }>>();
function faithfulImport(name: string) {
  const running =
    imports.get(name) ??
    (async () => {
      const model = faithfulModel(SCRIPTS[name]);
      return { imported: await importDocument(name, model.client), model };
    })();
  imports.set(name, running);
  return running;
}

const expectedOf = (name: string): ExpectedImportable[] =>
  expected
    .find((doc) => doc.document === name)!
    .questions.filter((question): question is ExpectedImportable => "item" in question);

const signed = (entry: StagedEntry) => signatureOf(entry.item as ItemInput);
const codesOf = (entry: StagedEntry) => entry.reasons.map((reason) => reason.code);
const checks = (entry: StagedEntry) => entry.reasons.filter((r) => r.code === "check_key");

/** What the old limit was, and what `config.ts` says one listed question costs (#590's probe). */
const OLD_SEGMENT_MAX_TOKENS = 8_000;
const TOKENS_PER_LISTED_QUESTION = 150;
/** The ledger's estimate (`ledger.ts`), which rounds towards more tokens. */
const CHARS_PER_TOKEN = 3;

// A hundred and twenty questions are sixty extract calls, and the PDF is cut for each of its.
const SLOW = 30_000;

describe("real-size documents through the import, with a scripted model", () => {
  it.each([
    [SIXTY_DOCX, 60],
    [LONG_BANK_MD, 120],
    [FORMATTING_DOCX, 11],
    [SIXTY_PDF, 60],
  ])(
    "%s: stages exactly %i questions, none lost or repeated",
    async (name, count) => {
      const { imported, model } = await faithfulImport(name);
      expect(model.faults).toEqual([]);
      const want = expectedOf(name);
      expect(imported.staged).toHaveLength(count);
      expect(imported.staged.every((entry) => entry.kind === "item")).toBe(true);
      // The document's own order, each question with its words, its options and its key.
      expect(imported.staged.map(signed)).toEqual(want.map((q) => signatureOf(asItem(q))));
      expect(imported.staged.map((entry) => entry.status)).toEqual(want.map((q) => q.status));
      expect(new Set(imported.rows.map((row) => row.position)).size).toBe(count);
      // Every call was reserved first and settled once.
      const { reserves, settles } = imported.ledger;
      expect(settles.map((settle) => settle.p_reservation).sort()).toEqual(
        reserves.map((_, index) => `res-${index + 1}`).sort(),
      );
    },
    SLOW,
  );

  it(
    "the 120-question bank: two questions that open alike stay two across the boundary",
    async () => {
      const { imported } = await faithfulImport(LONG_BANK_MD);
      expect(imported.segments.map((segment) => segment.questions.length)).toEqual([65, 55, 0]);
      const [before, after] = [imported.staged[64], imported.staged[65]];
      expect(openingKey(before.opening, 8)).toBe(openingKey(after.opening, 8));
      expect([before.chunk, after.chunk]).toEqual([0, 1]);
      // Question 66 opens the second chunk and is still found in the file's text, whole.
      const stems = expectedOf(LONG_BANK_MD).map((q) => asItem(q).stem.value);
      expect(after.sourceExcerpt).toContain(stems[65]);
      expect(after.sourceExcerpt).not.toContain(stems[64]);
      expect(after.sourceExcerpt).not.toContain(stems[66]);
    },
    SLOW,
  );

  it(
    "the 120-question bank: every key comes from the list at the back, select-all ones too",
    async () => {
      const { imported } = await faithfulImport(LONG_BANK_MD);
      expect(imported.segments.map((segment) => segment.answers.length)).toEqual([0, 0, 120]);
      expect(imported.segments.map((segment) => segment.droppedAnswers)).toEqual([0, 0, 0]);
      expect(imported.staged.every((entry) => entry.status === "ready")).toBe(true);
      // A key printed in the file's own text was checked there: no "check this key".
      expect(imported.staged.flatMap(checks)).toEqual([]);
      expect(imported.staged.filter((entry) => signed(entry).key.length > 1)).toHaveLength(6);
    },
    SLOW,
  );

  it(
    "the PDF: questions on the page two chunks share are read twice and staged once",
    async () => {
      const { imported } = await faithfulImport(SIXTY_PDF);
      const shared = sixtyPdfLayout().pageOf.filter((page) => page === 8).length;
      expect(shared).toBeGreaterThanOrEqual(2);
      const read = imported.segments.map((segment) => segment.questions.length);
      expect(read[0] + read[1]).toBe(60 + shared);
      expect(imported.staged).toHaveLength(60);
      // A PDF's key cannot be checked against text, so each says to check it.
      expect(imported.staged.map(checks)).toEqual(imported.staged.map(() => [CHECK_KEY]));
    },
    SLOW,
  );

  it("assembles the case study across the chunk boundary as one case study of six steps", async () => {
    const { imported, model } = await faithfulImport(CASE_STUDY_MD);
    expect(model.faults).toEqual([]);
    // Steps 1 to 5 in the first chunk and step 6 in the second, each under the title it repeats.
    expect(imported.segments.map((segment) => segment.questions.length)).toEqual([5, 1]);
    expect(imported.units).toBe(1);
    expect(model.calls.map((call) => call.kind).sort()).toEqual(
      ["segment", "segment", "extract", "extract", "extract", "charts"].sort(),
    );
    // The unit reads both chunks as one text: the first step and the last are both in it.
    const stems = caseStudyStems();
    for (const call of model.calls.filter((made) => made.kind !== "segment")) {
      expect(call.document).toContain(stems[0]);
      expect(call.document).toContain(stems[5]);
    }

    expect(imported.staged).toHaveLength(1);
    const [entry] = imported.staged;
    expect(entry).toMatchObject({
      kind: "case_study",
      status: "ready",
      group: { title: CASE_TITLE, step: null },
    });
    expect(codesOf(entry)).not.toContain("check_key");
    const caseStudy = entry.item as CaseStudy;
    expect(caseStudy.title).toBe(CASE_TITLE);
    const items = caseStudy.items as ItemInput[];
    expect(items.map((item) => item.stem.value)).toEqual(stems);
    expect(items.map((item) => signatureOf(item).key)).toEqual(
      caseStudyKeys().map((key) => [...key].sort()),
    );
    // Beside it in review: every step's part of the document, the one past the boundary too.
    for (const stem of stems) expect(entry.sourceExcerpt).toContain(stem);
  });

  it("keeps the bold and red keys with a check reason, and keys none of the three controls", async () => {
    const { imported } = await faithfulImport(FORMATTING_DOCX);
    const keyed = imported.staged.slice(0, 8);
    const controls = imported.staged.slice(8);
    expect(keyed.map((entry) => entry.status)).toEqual(keyed.map(() => "ready"));
    expect(keyed.map(checks)).toEqual(keyed.map(() => [CHECK_FORMAT_KEY]));
    expect(keyed.every((entry) => signed(entry).key.length === 1)).toBe(true);
    expect(controls.map((entry) => entry.status)).toEqual([
      "needs_answer",
      "needs_answer",
      "needs_answer",
    ]);
    expect(controls.map(codesOf)).toEqual([["needs_answer"], ["needs_answer"], ["needs_answer"]]);
    expect(controls.map((entry) => signed(entry).key)).toEqual([[], [], []]);
  });

  it("refuses a key a model gives a control: a bold stem word, all-bold options, a red table value", async () => {
    // Not faithful: this model stars the first option of every question the document leaves
    // unmarked, as one that "helps" would.
    const faithful = SCRIPTS[FORMATTING_DOCX];
    const eager: Script = {
      ...faithful,
      questions: faithful.questions.map((question, index) => {
        const draft = question.draft as RecordedDraft & { options: { text: string }[] };
        const starred = draft.options.map((option, place) =>
          place === 0 ? { text: `${option.text} *` } : option,
        );
        return index < 8 ? question : { ...question, draft: { ...draft, options: starred } };
      }),
    };
    const model = faithfulModel(eager);
    const imported = await importDocument(FORMATTING_DOCX, model.client);
    expect(model.faults).toEqual([]);
    const controls = imported.staged.slice(8);
    expect(controls.map((entry) => entry.status)).toEqual(["needs_fix", "needs_fix", "needs_fix"]);
    expect(controls.map(codesOf)).toEqual([["unmarked_key"], ["unmarked_key"], ["unmarked_key"]]);
    expect(controls.map((entry) => entry.item)).toEqual([null, null, null]);
    // The eight the document does mark are staged as before.
    expect(imported.staged.slice(0, 8).map((entry) => entry.status)).toEqual(
      Array.from({ length: 8 }, () => "ready"),
    );
  });

  it("reads the 60-question chunk in halves when one call overflows, each question once", async () => {
    const file = await corpusFile(SIXTY_DOCX);
    expect(file.prepared.chunks).toHaveLength(1);
    const model = faithfulModel(SCRIPTS[SIXTY_DOCX], { roomFor: 40 });
    const pass = await segmentPass(file, model.client);
    const [result] = pass.results;
    if (!result.ok) throw new Error(result.code);

    // One call for the chunk, cut off; then one for each half, which fit.
    expect(model.calls.map((call) => [call.kind, call.overflowed])).toEqual([
      ["segment", true],
      ["segment", false],
      ["segment", false],
    ]);
    const [whole, first, second] = model.calls.map((call) => call.questions);
    expect(whole).toBe(60);
    expect(first + second).toBe(60);
    expect(Math.min(first, second)).toBeGreaterThanOrEqual(20);
    expect(result.attempts).toBe(3);
    // The overflowing call is paid for as well: all of its room, then the halves' answers.
    expect(result.usage.outputTokens).toBeGreaterThan(SEGMENT_MAX_TOKENS);
    // The chunk's pages ride on its first reservation; the halves reserve none.
    expect(pass.ledger.reserves.map((reserve) => reserve.p_pages)).toEqual([
      expect.any(Number),
      0,
      0,
    ]);
    expect(pass.ledger.reserves[0].p_pages).toBeGreaterThan(0);
    expect(pass.ledger.settles).toHaveLength(3);

    // Joined, the halves are the chunk's one segment: sixty questions, in order, each once.
    expect(pass.segments).toEqual([result.segment]);
    expect(result.segment.questions.map((question) => question.excerpt)).toEqual(
      SCRIPTS[SIXTY_DOCX].questions.map((question) => question.opening),
    );
    expect(result.segment.questions.map((question) => question.index)).toEqual(
      Array.from({ length: 60 }, (_, index) => index),
    );

    // And the import ends as it does when the chunk fits one call.
    const extracted = await extractPass(file, model.client, pass.segments, {
      ledger: pass.ledger,
    });
    expect(model.faults).toEqual([]);
    expect(extracted.staged.map(signed)).toEqual(
      expectedOf(SIXTY_DOCX).map((q) => signatureOf(asItem(q))),
    );
    expect(extracted.staged.every((entry) => entry.status === "ready")).toBe(true);
  });

  it("refuses the chunk as too large when its halves overflow too, and stores nothing", async () => {
    const file = await corpusFile(SIXTY_DOCX);
    const model = faithfulModel(SCRIPTS[SIXTY_DOCX], { roomFor: 20 });
    const pass = await segmentPass(file, model.client);
    expect(pass.results).toEqual([{ ok: false, code: "part_too_large" }]);
    expect(model.calls.map((call) => call.overflowed)).toEqual([true, true, true]);
    expect(pass.segments).toEqual([]);
    // Each of the three calls was billed, so each reservation is settled.
    expect(pass.ledger.settles).toHaveLength(3);
  });

  it(
    "a faithful segment answer for the densest chunk fits SEGMENT_MAX_TOKENS by either estimate",
    async () => {
      const names = [SIXTY_DOCX, LONG_BANK_MD, FORMATTING_DOCX, CASE_STUDY_MD, SIXTY_PDF];
      const reads = (await Promise.all(names.map(faithfulImport))).flatMap(({ model }, at) =>
        model.calls
          .filter((call) => call.kind === "segment")
          .map((call) => ({ name: names[at], ...call })),
      );
      const densest = reads.reduce((most, read) => (read.questions > most.questions ? read : most));
      expect([densest.name, densest.questions]).toEqual([LONG_BANK_MD, 65]);

      // By what `config.ts` says a listed question costs, the sixty of the Word bank and the
      // densest chunk here are both past the old limit and inside the new one.
      const tokens = (questions: number) => questions * TOKENS_PER_LISTED_QUESTION;
      expect(tokens(60)).toBeGreaterThan(OLD_SEGMENT_MAX_TOKENS);
      expect(tokens(densest.questions)).toBeGreaterThan(OLD_SEGMENT_MAX_TOKENS);
      expect(tokens(densest.questions)).toBeLessThanOrEqual(SEGMENT_MAX_TOKENS);
      // By the answer's own length, at the ledger's three characters a token, every chunk's
      // answer fits the limit too: no document here should need the halves on a live run.
      //
      // The two estimates do not agree about the old limit: by length the densest answer is
      // about 6,500 tokens, which 8,000 would have held. Neither is a measurement. Only a live
      // run says what a listed question costs, and whether the sixty overflow `main` before #590.
      for (const read of reads) {
        expect(Math.ceil(read.answerChars / CHARS_PER_TOKEN), read.name).toBeLessThanOrEqual(
          SEGMENT_MAX_TOKENS,
        );
      }
    },
    SLOW,
  );
});
