import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prepareFile, type PreparedFile } from "@/lib/aiImport/files/prepare";
import { openingKey } from "@/lib/aiImport/sourceText";
import { assembleCaseStudy, caseStudyDraftSchema } from "@/lib/ngn/draft";
import type { ItemInput } from "@/lib/ngn/schemas";
import {
  LONG_BANK_MD,
  SIXTY_DOCX,
  SIXTY_PDF,
  sixtyPdfLayout,
} from "./corpus/generate/bankDocuments";
import {
  CASE_STUDY_MD,
  CASE_TITLE,
  caseStudyKeys,
  caseStudyStems,
} from "./corpus/generate/caseStudy";
import { generateCorpus, type CorpusDocument, type ExpectedFile } from "./corpus/generate";
import { CORPUS_DIR, loadExpected, RECORDINGS_DIR } from "./files";
import { similarity } from "./score";
import { signatureOf } from "./signature";

/**
 * The real-size corpus documents (#594) are written by `corpus/generate`, and committed. This
 * holds the committed files to what the generator writes, so neither can change without the
 * other, and checks the documents are the size and shape they are there for.
 *
 * `AI_IMPORT_WRITE_CORPUS=1` writes the files instead of checking them (see `corpus/generate`).
 */

const WRITE = process.env.AI_IMPORT_WRITE_CORPUS === "1";
const generated = generateCorpus();
const byName = (name: string): CorpusDocument => {
  const found = generated.find((doc) => doc.name === name);
  if (!found) throw new Error(`the generator writes no ${name}`);
  return found;
};

const expectedPath = (name: string) =>
  join(CORPUS_DIR, name.replace(/\.[a-z]+$/, ".expected.json"));
const recordingPath = (name: string) => join(RECORDINGS_DIR, name.replace(/\.[a-z]+$/, ".json"));
const asJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * The case study's expected file, converted from its recording with the product's assembly. It
 * is written once and then checked by hand (the keys below), not held to the generator: if the
 * assembly ever changes what it builds, the committed file must still say what is right.
 */
function convertedCaseStudy(doc: CorpusDocument): ExpectedFile {
  const draft = caseStudyDraftSchema.parse(doc.recording.caseStudies[0].draft);
  const { steps, ...charts } = draft;
  const [assembled] = assembleCaseStudy({ title: draft.title, charts, steps }, { id: "case11" });
  if (assembled.kind !== "case_study" || assembled.reasons.length > 0) {
    throw new Error(`the case study does not assemble: ${JSON.stringify(assembled.reasons)}`);
  }
  return {
    document: doc.name,
    covers: ["case-study", "case-study-across-chunks"],
    questions: [],
    caseStudies: [
      { label: CASE_TITLE, caseStudy: assembled.caseStudy as unknown as Record<string, unknown> },
    ],
  };
}

async function prepared(name: string): Promise<PreparedFile> {
  const file = await prepareFile(byName(name).bytes, name);
  if (!file.ok) throw new Error(`${name}: ${file.code}`);
  return file;
}

describe.runIf(WRITE)("writing the real-size corpus", () => {
  it("writes each document, its expected file and its recording", () => {
    for (const doc of generated) {
      writeFileSync(join(CORPUS_DIR, doc.name), doc.bytes);
      writeFileSync(expectedPath(doc.name), asJson(doc.expected ?? convertedCaseStudy(doc)));
      writeFileSync(recordingPath(doc.name), asJson(doc.recording));
    }
  });
});

describe.skipIf(WRITE)("the real-size corpus is what its generator writes", () => {
  it.each(generated.map((doc) => doc.name))("%s", (name) => {
    const doc = byName(name);
    // The documents byte for byte; the JSON by what it says, so it can be formatted as the
    // repo's other JSON is.
    expect(readFileSync(join(CORPUS_DIR, name)).equals(Buffer.from(doc.bytes))).toBe(true);
    expect(JSON.parse(readFileSync(recordingPath(name), "utf8"))).toEqual(doc.recording);
    expect(existsSync(expectedPath(name))).toBe(true);
    if (doc.expected !== null) {
      expect(JSON.parse(readFileSync(expectedPath(name), "utf8"))).toEqual(doc.expected);
    }
  });

  it("the case study's expected file has the six keys the document marks", () => {
    const expected = loadExpected().find((doc) => doc.document === CASE_STUDY_MD)!;
    expect(expected.caseStudies).toHaveLength(1);
    const { caseStudy } = expected.caseStudies[0];
    expect(caseStudy.title).toBe(CASE_TITLE);
    const items = caseStudy.items as ItemInput[];
    expect(items.map((item) => item.stem.value)).toEqual(caseStudyStems());
    expect(items.map((item) => item.type)).toEqual([
      "multiple_response",
      "multiple_choice",
      "multiple_choice",
      "matrix_multiple_choice",
      "multiple_response",
      "matrix_multiple_choice",
    ]);
    expect(items.map((item) => signatureOf(item).key)).toEqual(
      caseStudyKeys().map((key) => [...key].sort()),
    );
  });
});

describe("the real-size documents", () => {
  // Read when a test asks, not when the file is collected: a first write has nothing to read yet.
  let loaded: ReturnType<typeof loadExpected> | undefined;
  const stemsOf = (name: string): string[] => {
    loaded ??= loadExpected();
    const doc = loaded.find((entry) => entry.document === name)!;
    return doc.questions.map((question) =>
      question.status === "not_importable"
        ? question.opening
        : (question.item as unknown as ItemInput).stem.value,
    );
  };

  it.each([SIXTY_DOCX, LONG_BANK_MD, SIXTY_PDF, "10-keyed-by-formatting.docx"])(
    "%s: every question pairs with its own expected entry and no other",
    (name) => {
      // The scorer pairs a question with an entry by the first 12 words of its opening, and the
      // product finds a question in the text by the same. Stems that open alike are the point of
      // these documents, so each must still differ from every other inside those 12 words.
      const stems = stemsOf(name);
      const keys = stems.map((stem) => openingKey(stem));
      expect(new Set(keys).size).toBe(stems.length);
      stems.forEach((stem, at) => {
        const twins = stems.filter((other, place) => place !== at && similarity(stem, other) >= 1);
        expect(twins, stem).toEqual([]);
      });
    },
  );

  it("the 60-question bank opens most stems with the same words, and is one chunk of text", async () => {
    const same = stemsOf(SIXTY_DOCX).filter((stem) =>
      stem.startsWith("A nurse is caring for a client who has "),
    );
    expect(same).toHaveLength(60);
    const file = await prepared(SIXTY_DOCX);
    expect(file.kind).toBe("docx");
    expect(file.chunks).toHaveLength(1);
  });

  it("the 120-question bank is three chunks, with a boundary between two questions that open alike", async () => {
    const file = await prepared(LONG_BANK_MD);
    expect(file.chunks.length).toBeGreaterThanOrEqual(3);
    const stems = stemsOf(LONG_BANK_MD);
    expect(stems).toHaveLength(120);
    // The last question of a chunk and the first of the next: at least one such pair shares its
    // first eight words, which is what the merge once took for one question read twice (#592).
    const lastIn = (text: string) => stems.findLast((stem) => text.includes(stem)) ?? null;
    const firstIn = (text: string) => stems.find((stem) => text.includes(stem)) ?? null;
    const pairs = file.chunks.slice(1).flatMap((chunk, at) => {
      const before = lastIn(file.chunks[at].text ?? "");
      const after = firstIn(chunk.text ?? "");
      return before !== null && after !== null ? [[before, after]] : [];
    });
    const alike = pairs.filter(([before, after]) => openingKey(before, 8) === openingKey(after, 8));
    expect(alike.length).toBeGreaterThan(0);
    // A question opens the second chunk, right after the blank line that was cut away (#592).
    expect(file.chunks[1].text?.startsWith(`66. ${stems[65]}`)).toBe(true);
    expect(file.chunks[1].gapBefore).toBe("\n\n");
    // Select-all questions are keyed at the back with several letters.
    const key = new TextDecoder().decode(byName(LONG_BANK_MD).bytes).split("## Answer Key")[1];
    expect(key.match(/^\d+\. [A-E](?:, [A-E])+$/gm)?.length).toBe(6);
  });

  it("the case study's steps are in more than one chunk, each chunk naming the case study", async () => {
    const file = await prepared(CASE_STUDY_MD);
    const holding = file.chunks.map((chunk) =>
      caseStudyStems().filter((stem) => chunk.text?.includes(stem)),
    );
    expect(holding.flat()).toEqual(caseStudyStems());
    expect(holding.filter((stems) => stems.length > 0).length).toBeGreaterThanOrEqual(2);
    for (const chunk of file.chunks) expect(chunk.text).toContain(CASE_TITLE);
  });

  it("the PDF is two chunks that share a page where several questions start", async () => {
    const file = await prepared(SIXTY_PDF);
    expect(file.chunks.map((chunk) => [chunk.pageFrom, chunk.pageTo])).toEqual([
      [1, 8],
      [8, 10],
    ]);
    const { pageOf } = sixtyPdfLayout();
    expect(pageOf).toHaveLength(60);
    expect(pageOf.filter((page) => page === 8).length).toBeGreaterThanOrEqual(2);
  });
});
