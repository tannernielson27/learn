import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { caseStudySchema, ITEM_TYPES, itemSchema } from "@/lib/ngn/schemas";
import {
  asItem,
  CORPUS_CASES,
  CORPUS_DIR,
  loadExpected,
  loadRecordings,
  NOT_IMPORTABLE,
} from "./files";
import { buildReport, formatReport, isPerfect, scoreDocument } from "./score";
import { signatureOf } from "./signature";

/**
 * The golden corpus (#339), offline: every document has an expected output that is valid
 * learn.v1, the corpus covers every type and every case the issue lists, and the recorded
 * responses score as the snapshot says. Nothing here calls the API.
 */

const DOCUMENT_TYPES = new Set([".md", ".docx", ".pdf"]);
// The notice's opening words; a PDF string escapes the parentheses that follow them.
const NOTICE = "Fictional content written for the LeaRN test corpus";

const documents = readdirSync(CORPUS_DIR)
  .filter((name) => DOCUMENT_TYPES.has(extname(name)))
  .sort();
const expected = loadExpected();
const recordings = loadRecordings();

describe("the corpus", () => {
  it("has an expected output for every document, and a document for every expected output", () => {
    expect(expected.map((doc) => doc.document)).toEqual(documents);
  });

  it("is in all three formats", () => {
    expect(new Set(documents.map((name) => extname(name)))).toEqual(DOCUMENT_TYPES);
  });

  it.each(documents)("%s says it is fictional", (name) => {
    // The .docx is stored uncompressed and the PDFs' metadata is plain text, so the notice
    // is readable in the bytes of every document (the scanned page carries it in its image too).
    expect(readFileSync(join(CORPUS_DIR, name)).includes(NOTICE)).toBe(true);
  });

  it("covers every item type and the not-importable bucket", () => {
    const buckets = new Set(
      expected.flatMap((doc) => [
        ...doc.questions.map((question) =>
          question.status === NOT_IMPORTABLE ? NOT_IMPORTABLE : asItem(question).type,
        ),
        ...doc.caseStudies.flatMap((entry) =>
          (entry.caseStudy.items as { type: string }[]).map((item) => item.type),
        ),
      ]),
    );
    expect([...buckets].sort()).toEqual([...ITEM_TYPES, NOT_IMPORTABLE].sort());
  });

  it("covers every case the issue lists, and names no case it does not know", () => {
    const covered = new Set(expected.flatMap((doc) => doc.covers));
    expect([...covered].sort()).toEqual([...CORPUS_CASES].sort());
  });

  it("has at least one question with no key in the source", () => {
    const unmarked = expected.flatMap((doc) =>
      doc.questions.filter((question) => question.status === "needs_answer"),
    );
    expect(unmarked.length).toBeGreaterThan(0);
  });

  describe.each(expected)("$document", (doc) => {
    it("expects valid learn.v1, and no key where the source has none", () => {
      for (const question of doc.questions) {
        if (question.status === NOT_IMPORTABLE) continue;
        const item = asItem(question);
        if (question.status === "ready") {
          expect(itemSchema.safeParse(item).success, question.label).toBe(true);
        } else {
          expect(signatureOf(item).key, question.label).toEqual([]);
        }
      }
      for (const { label, caseStudy } of doc.caseStudies) {
        expect(caseStudySchema.safeParse(caseStudy).success, label).toBe(true);
      }
    });
  });
});

describe("the recorded responses", () => {
  const scores = expected.map((doc) => scoreDocument(doc, recordings.get(doc.document)));
  const report = buildReport(scores);

  it("cover every document, and only the corpus", () => {
    expect([...recordings.keys()].sort()).toEqual(documents);
  });

  it("never invent a key or a question", () => {
    expect(report.inventedKeys).toBe(0);
    expect(report.extras).toBe(0);
  });

  it.each(expected.map((doc) => doc.document))(
    "%s: a hand-written recording scores 100%%",
    (name) => {
      const recording = recordings.get(name);
      if (recording?.source !== "hand-written") return;
      const score = scoreDocument(
        expected.find((doc) => doc.document === name)!,
        recording,
      );
      const single = buildReport([score]);
      expect(isPerfect(single), formatReport(single)).toBe(true);
    },
  );

  it("score as recorded (update with `pnpm vitest -u` when a recording is replaced)", () => {
    expect(formatReport(report)).toMatchSnapshot();
  });
});
