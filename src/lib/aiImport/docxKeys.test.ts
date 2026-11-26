import { describe, expect, it } from "vitest";
import { NO_USAGE } from "@/lib/ai/config";
import { extractQuestions, regionsOf, type UnitCall } from "./extractQuestions";
import { chunkPayload, prepareFile } from "./files/prepare";
import { buildDocx, para, run } from "./files/testing/fixtures";
import { mergeSegments } from "./merge";
import { readSegment } from "./segment";

/**
 * #592's demo step without Claude: a Word quiz whose answers are marked in red and in bold goes
 * through the real converter, the segment check, the regions and staging. The stub model keys
 * every question, the third one too, which the document does not mark: that key must be refused.
 */

const STEMS = [
  "Which food should the nurse offer first to a client with nausea?",
  "Which action is the priority for a client with stridor?",
  "Which finding is expected after a fictional procedure?",
];

const body = [
  para(run("Fictional content written for the LeaRN test corpus (#592). No real patients.")),
  para(run("Question 1", { bold: true })),
  para(`1. ${STEMS[0]}`),
  para("A. Plain white rice"),
  para(run("B. "), run("Greek yogurt", { colour: "C00000" })),
  para("C. Apple juice"),
  para("D. Black coffee"),
  para(run("Question 2", { bold: true })),
  para(
    run("2. Which action is the "),
    run("priority", { underline: true }),
    run(" for a client with stridor?"),
  ),
  para("A. Wait and reassess"),
  para(run("B. Assess the airway", { bold: true })),
  para("C. Call the family"),
  para("D. Document the finding"),
  para(run("Question 3", { bold: true })),
  para(run(`3. ${STEMS[2]}`, { bold: true })),
  para("A. Fever"),
  para("B. Mild soreness"),
  para("C. Bleeding"),
  para("D. Numbness"),
].join("");

const OPTIONS = [
  ["Plain white rice", "Greek yogurt *", "Apple juice", "Black coffee"],
  ["Wait and reassess", "Assess the airway *", "Call the family", "Document the finding"],
  // Invented: the document marks none of these.
  ["Fever", "Mild soreness *", "Bleeding", "Numbness"],
];

/** Answers an extract request with a keyed draft for each question it names. */
const keyEverything: UnitCall = async (request) => {
  const last = request.content.at(-1);
  const ask = last?.type === "text" ? last.text : "";
  const asked = JSON.parse(/<questions>\n([\s\S]*?)\n<\/questions>/.exec(ask)?.[1] ?? "[]") as {
    field: string;
    opens: string;
  }[];
  const value = Object.fromEntries(
    asked.map((question) => {
      const at = STEMS.indexOf(question.opens);
      return [
        question.field,
        {
          draft: {
            type: "multiple_choice",
            stem: STEMS[at],
            options: OPTIONS[at].map((text) => ({ text })),
          },
          sourceErrors: [],
        },
      ];
    }),
  );
  return { value, usage: NO_USAGE, attempts: 1 };
};

describe("a Word quiz keyed in red and in bold", () => {
  async function staged() {
    const bytes = buildDocx({ body });
    const prepared = await prepareFile(bytes, "quiz.docx");
    if (!prepared.ok) throw new Error(prepared.code);
    const payload = await chunkPayload(bytes, prepared, 0);
    if (payload.type !== "text") throw new Error("not text");
    const segment = readSegment(
      {
        questions: STEMS.map((excerpt, index) => ({
          excerpt,
          number: String(index + 1),
          type: "multiple_choice",
          confidence: 0.9,
          instructorNote: false,
          reliesOnImage: false,
          cutOff: false,
          continued: false,
        })),
        answers: [],
      },
      { position: 0, of: 1, pageFrom: null, pageTo: null },
      payload,
    );
    const questions = mergeSegments([segment]).questions;
    const entries = await extractQuestions(
      keyEverything,
      questions,
      { payload, kind: "docx", sourceText: payload.text },
      regionsOf(questions, payload.text),
    );
    return { markdown: payload.text, segment, entries };
  }

  it("reaches Claude with the red and the bold marked", async () => {
    const { markdown } = await staged();
    expect(markdown).toContain("B. ==Greek yogurt=={color #C00000}");
    expect(markdown).toContain("**B. Assess the airway**");
    expect(markdown).toContain(`**3. ${STEMS[2]}**`);
  });

  it("finds each stem in the document, the underlined one too", async () => {
    const { segment } = await staged();
    expect(segment.questions.map((question) => question.flags.notInSource)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("keeps the red key and the bold key, each with a check, and refuses the invented one", async () => {
    const { entries } = await staged();
    expect(entries.map((entry) => entry.status)).toEqual(["ready", "ready", "needs_fix"]);
    for (const entry of entries.slice(0, 2)) {
      expect(entry.reasons.filter((reason) => reason.code === "check_key")).toEqual([
        {
          code: "check_key",
          message:
            "The key was read from bold, underlined or coloured text, which may not mark an answer. Check it.",
        },
      ]);
    }
    for (const entry of entries.slice(0, 2)) {
      expect(entry.item).toMatchObject({
        type: "multiple_choice",
        answerKey: { correctOptionId: "opt_b" },
      });
    }
    // Bold on "Question 3" and on its stem marks no option.
    expect(entries[2].item).toBeNull();
    expect(entries[2].reasons.map((reason) => reason.code)).toEqual(["unmarked_key"]);
  });
});
