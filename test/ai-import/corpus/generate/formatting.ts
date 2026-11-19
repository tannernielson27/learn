import { para, run, table } from "@/lib/aiImport/files/testing/fixtures";
import { letter, type BankQuestion } from "./bank";
import { NOTICE, writeDocx } from "./files";
import { expectedQuestion, recordedQuestion, type CorpusDocument } from "./shared";

/**
 * A Word quiz whose only answer marks are formatting (#594, on #592's rule in `choiceMarks.ts`):
 * a part keyed in bold, a part keyed in red, and three questions that carry formatting which
 * marks no answer and must come out with no key. Fictional, written for this repo.
 */

export const FORMATTING_DOCX = "10-keyed-by-formatting.docx";

const RED = "C00000";

/** How a question's right option is set apart in the document. */
type Mark =
  /** The whole option paragraph is bold, its letter included. */
  | "bold"
  /** The option's words are bold; its letter is plain. */
  | "bold_words"
  /** The whole option paragraph is red. */
  | "red"
  /** The option's words are red; its letter is plain. */
  | "red_words"
  /** Every option is bold, which marks none of them. */
  | "all_bold"
  | "none";

interface FormattedQuestion extends BankQuestion {
  mark: Mark;
  /** A word of the stem printed in bold: emphasis, not an answer. */
  boldWord?: string;
}

const question = (
  stem: string,
  options: string[],
  right: string,
  mark: Mark,
  boldWord?: string,
): FormattedQuestion => ({
  stem,
  options,
  correct: [options.indexOf(right)],
  selectAll: false,
  mark,
  ...(boldWord ? { boldWord } : {}),
});

/** Part A: the right option is bold. */
const BOLD_KEYED: FormattedQuestion[] = [
  question(
    "Which action should the nurse take first when a fire starts in a client's room?",
    [
      "Close the doors to the nearby rooms",
      "Move the client out of the room",
      "Pull the nearest fire alarm",
      "Use a fire extinguisher on the flames",
    ],
    "Move the client out of the room",
    "bold",
  ),
  question(
    "A nurse is caring for a client who has a Clostridioides difficile infection. Which action should the nurse take before leaving the room?",
    [
      "Use an alcohol-based hand rub",
      "Put on a clean pair of gloves",
      "Wash the hands with soap and water",
      "Rinse the hands with water only",
    ],
    "Wash the hands with soap and water",
    "bold_words",
  ),
  question(
    "Which client should the nurse place in a negative-pressure room?",
    [
      "A client who has active pulmonary tuberculosis",
      "A client who has influenza",
      "A client who has a wound infected with MRSA",
      "A client who has a urinary tract infection",
    ],
    "A client who has active pulmonary tuberculosis",
    "bold",
  ),
  question(
    "Which pair of identifiers should the nurse use to identify a client before giving a medication?",
    [
      "Room number and bed number",
      "Diagnosis and room number",
      "First name and bed number",
      "Full name and date of birth",
    ],
    "Full name and date of birth",
    "bold_words",
  ),
];

/** Part B: the right option is red. */
const RED_KEYED: FormattedQuestion[] = [
  question(
    "Which food should the nurse remove from the meal tray of a client who is on a low-sodium diet?",
    ["Fresh apple slices", "Canned chicken noodle soup", "Steamed white rice", "Unsalted crackers"],
    "Canned chicken noodle soup",
    "red_words",
  ),
  question(
    "A nurse is caring for a client who is at risk for falls. Which action should the nurse take?",
    [
      "Keep the bed in its highest position",
      "Leave the room lights off at night",
      "Raise all four side rails",
      "Keep the call light within the client's reach",
    ],
    "Keep the call light within the client's reach",
    "red",
  ),
  question(
    "Which piece of protective equipment should the nurse remove first after caring for a client who is on contact precautions?",
    ["Gloves", "Gown", "Mask", "Goggles"],
    "Gloves",
    "red_words",
  ),
  question(
    "A nurse finds that another nurse gave a client the wrong medication. Which action should the nurse take first?",
    [
      "Complete an incident report",
      "Notify the nurse manager",
      "Assess the client",
      "Call the pharmacy",
    ],
    "Assess the client",
    "red",
  ),
];

/**
 * Part C: formatting that is not a key. A bold word in a stem; bold on every option; and, in the
 * part of the document before the last question, a laboratory table with one value in red. The
 * document marks no answer for any of the three.
 */
const UNKEYED: FormattedQuestion[] = [
  question(
    "Which action should the nurse take first for a client who has a latex allergy and needs a urinary catheter?",
    [
      "Notify the provider of the allergy",
      "Obtain a latex-free catheter kit",
      "Place an allergy band on the client's wrist",
      "Ask the client about past reactions to latex",
    ],
    "Obtain a latex-free catheter kit",
    "none",
    "first",
  ),
  question(
    "Which statement by a new nurse shows an understanding of standard precautions?",
    [
      '"I wear gloves when I may touch blood or body fluids."',
      '"I use them only for clients who have an infection."',
      '"I do not need to clean my hands after I take off gloves."',
      '"I recap used needles before I throw them away."',
    ],
    '"I wear gloves when I may touch blood or body fluids."',
    "all_bold",
  ),
  question(
    "A nurse reviews the laboratory results above for a client who takes digoxin and furosemide. Which action should the nurse take first?",
    [
      "Give the morning dose of digoxin",
      "Notify the provider of the potassium level",
      "Encourage the client to drink more water",
      "Repeat the laboratory tests tomorrow",
    ],
    "Notify the provider of the potassium level",
    "none",
  ),
];

const LAB_TABLE = table([
  ["Test", "Result", "Reference range"],
  ["Potassium", { text: para(run("3.0 mEq/L", { colour: RED })) }, "3.5 to 5.0 mEq/L"],
  ["Sodium", "138 mEq/L", "135 to 145 mEq/L"],
  ["Digoxin level", "1.4 ng/mL", "0.8 to 2.0 ng/mL"],
]);

export const formattingQuestions = (): FormattedQuestion[] => [
  ...BOLD_KEYED,
  ...RED_KEYED,
  ...UNKEYED,
];

/** The stem as the document's markdown has it: a bold word between `**`. */
const markdownStem = ({ stem, boldWord }: FormattedQuestion): string =>
  boldWord ? stem.replace(` ${boldWord} `, ` **${boldWord}** `) : stem;

function stemParagraph(item: FormattedQuestion, number: number): string {
  if (!item.boldWord) return para(`${number}. ${item.stem}`);
  const [before, after] = item.stem.split(` ${item.boldWord} `);
  return para(run(`${number}. ${before} `), run(item.boldWord, { bold: true }), run(` ${after}`));
}

function optionParagraph(item: FormattedQuestion, place: number): string {
  const prefix = `${letter(place)}. `;
  const text = item.options[place];
  const right = item.correct.includes(place);
  if (item.mark === "all_bold") return para(run(prefix + text, { bold: true }));
  if (!right || item.mark === "none") return para(prefix + text);
  if (item.mark === "bold") return para(run(prefix + text, { bold: true }));
  if (item.mark === "bold_words") return para(run(prefix), run(text, { bold: true }));
  if (item.mark === "red") return para(run(prefix + text, { colour: RED }));
  return para(run(prefix), run(text, { colour: RED }));
}

const heading = (text: string): string => para(run(text, { bold: true }));

export function formattingDocx(): CorpusDocument {
  const questions = formattingQuestions();
  const numbered = questions.map((item, index) => ({ item, number: index + 1 }));
  const paragraphs = ({ item, number }: (typeof numbered)[number]): string[] => [
    stemParagraph(item, number),
    ...item.options.map((_, place) => optionParagraph(item, place)),
  ];
  const partA = numbered.slice(0, BOLD_KEYED.length);
  const partB = numbered.slice(BOLD_KEYED.length, BOLD_KEYED.length + RED_KEYED.length);
  const partC = numbered.slice(BOLD_KEYED.length + RED_KEYED.length);
  const body = [
    heading("Safety and Infection Control Quiz"),
    para(NOTICE),
    heading("Part A. Correct answers are in bold."),
    ...partA.flatMap(paragraphs),
    heading("Part B. Correct answers are in red."),
    ...partB.flatMap(paragraphs),
    heading("Part C. Review questions. No answers are marked."),
    ...partC.slice(0, 2).flatMap(paragraphs),
    para("Laboratory results for the next question"),
    LAB_TABLE,
    ...partC.slice(2).flatMap(paragraphs),
  ].join("");

  const keyed = (item: FormattedQuestion) => item.mark !== "none" && item.mark !== "all_bold";
  const printed = (item: FormattedQuestion): BankQuestion => ({
    ...item,
    stem: markdownStem(item),
  });
  return {
    name: FORMATTING_DOCX,
    bytes: writeDocx(body),
    expected: {
      document: FORMATTING_DOCX,
      covers: ["formatting-key", "formatting-not-a-key", "unmarked-key"],
      questions: numbered.map(({ item, number }) =>
        expectedQuestion(`format10_q${number}`, `${number}.`, printed(item), keyed(item)),
      ),
      caseStudies: [],
    },
    recording: {
      document: FORMATTING_DOCX,
      source: "generated",
      // A bold or red option is the document's answer mark, and the draft carries it as a `*`
      // (`DOCX_MARKUP`). The three questions of part C have no mark, so their drafts have none.
      questions: questions.map((item) => recordedQuestion(printed(item), { starred: keyed(item) })),
      caseStudies: [],
    },
  };
}
