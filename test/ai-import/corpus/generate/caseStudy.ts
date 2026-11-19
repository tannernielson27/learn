import { NOTICE } from "./files";
import { openingOf, type CorpusDocument } from "./shared";

/**
 * A six-step unfolding case study long enough to cross a chunk boundary (#594). Its patient
 * record is printed again with every step and grows as the case goes on, as instructors' case
 * studies do, so the document is several times the length of what is written here. Fictional:
 * the patient, the values and the times were made up for this repo.
 *
 * Every step's heading carries the case study's title. That is what lets the steps in a later
 * chunk be grouped with the ones before it: a chunk is read by itself, and a title printed once
 * at the top of the document is not in it.
 */

export const CASE_STUDY_MD = "11-case-study-across-chunks.md";
export const CASE_TITLE = "Unfolding Case Study: Diabetic Ketoacidosis";

type Step = 1 | 2 | 3 | 4 | 5 | 6;
const STEPS: readonly Step[] = [1, 2, 3, 4, 5, 6];

const PATIENT = { name: "Maya Ortega", age: "19", sex: "female", setting: "Emergency department" };

const HISTORY = [
  "Chief concern: The client is brought to the emergency department by a roommate after 2 days of nausea, vomiting and abdominal pain. The roommate says the client has been drinking water all day, urinating often and breathing fast since last night.",
  "History: Type 1 diabetes mellitus diagnosed at age 11. Uses an insulin pump. The pump's infusion set came out 2 days ago during a hiking trip and was not replaced, because the client felt too sick to eat. No other medical conditions. No surgeries. No known allergies. Does not smoke or drink alcohol.",
  "Medications at home: Insulin lispro by pump, with a basal rate of 0.8 units/h and a bolus with each meal. Carries glucose tablets. Takes no other medicines or supplements.",
  "Physical examination: Drowsy, but answers questions when spoken to. Lips and tongue are dry, and the skin on the forearm stays tented when pinched. Breathing is deep and fast, and the breath smells fruity. Lungs are clear. Heart rate is fast and regular. Abdomen is soft and tender all over, with no guarding. Capillary refill is 4 seconds.",
];

/** Each entry is printed from the step it is charted at onward. */
const NOTES: readonly { from: Step; text: string }[] = [
  {
    from: 1,
    text: "Day 1, 0900: Client arrives by private car with a roommate. Drowsy, oriented to person and place. Reports nausea, thirst and abdominal pain rated 6 on a scale of 0 to 10. Fingerstick glucose reads HI. Placed on the cardiac monitor. Two large-bore IV catheters started.",
  },
  {
    from: 2,
    text: "Day 1, 0930: Laboratory samples sent. Urine dipstick shows large ketones and large glucose. Client vomited 150 mL of green fluid. Respirations are deep and fast.",
  },
  {
    from: 3,
    text: "Day 1, 0945: Provider at the bedside. Prescriptions received and read back.",
  },
  {
    from: 4,
    text: "Day 1, 1000: First liter of 0.9% sodium chloride started as a bolus through the IV in the left forearm. Client asks for water to drink.",
  },
  {
    from: 5,
    text: "Day 1, 1100: First liter of 0.9% sodium chloride finished. Regular insulin infusion started at 0.1 units/kg/h after the potassium result was reviewed with the provider. Potassium chloride added to the IV fluid as prescribed.",
  },
  {
    from: 5,
    text: "Day 1, 1200: Client is more alert and is oriented to person, place and time. Urine output 60 mL in the last hour. No vomiting since 0930.",
  },
  {
    from: 6,
    text: "Day 1, 1400: Client is awake and talking with the roommate. Reports hunger and no nausea. Breathing is quiet and regular.",
  },
  {
    from: 6,
    text: "Day 1, 1500: Diabetes educator paged at the client's request to review insulin pump site changes and sick-day rules.",
  },
];

const VITAL_ROWS = [
  "Temperature",
  "Heart rate",
  "Respiratory rate",
  "Blood pressure",
  "SpO2",
  "Fingerstick glucose",
];

/** One column of the flow sheet: the time, the step it is first shown at, and a value per row. */
const VITALS: readonly { from: Step; time: string; values: string[] }[] = [
  {
    from: 1,
    time: "0900",
    values: ["37.4 °C", "128/min", "30/min", "94/58 mm Hg", "98% room air", "HI"],
  },
  {
    from: 2,
    time: "0930",
    values: ["37.4 °C", "132/min", "32/min", "90/54 mm Hg", "98% room air", "HI"],
  },
  {
    from: 4,
    time: "1000",
    values: ["37.2 °C", "124/min", "30/min", "98/60 mm Hg", "99% room air", "512 mg/dL"],
  },
  {
    from: 5,
    time: "1100",
    values: ["37.1 °C", "112/min", "26/min", "106/64 mm Hg", "99% room air", "438 mg/dL"],
  },
  {
    from: 5,
    time: "1200",
    values: ["37.0 °C", "104/min", "22/min", "110/68 mm Hg", "99% room air", "362 mg/dL"],
  },
  {
    from: 6,
    time: "1400",
    values: ["37.0 °C", "92/min", "18/min", "116/72 mm Hg", "99% room air", "248 mg/dL"],
  },
];

interface Lab {
  from: Step;
  label: string;
  value: string;
  unit?: string;
  flag?: "H" | "L";
}

const LABS: readonly Lab[] = [
  { from: 2, label: "Glucose", value: "586", unit: "mg/dL", flag: "H" },
  { from: 2, label: "Sodium", value: "131", unit: "mEq/L", flag: "L" },
  { from: 2, label: "Potassium", value: "5.4", unit: "mEq/L", flag: "H" },
  { from: 2, label: "Chloride", value: "96", unit: "mEq/L", flag: "L" },
  { from: 2, label: "Bicarbonate", value: "9", unit: "mEq/L", flag: "L" },
  { from: 2, label: "Blood urea nitrogen", value: "32", unit: "mg/dL", flag: "H" },
  { from: 2, label: "Creatinine", value: "1.5", unit: "mg/dL", flag: "H" },
  { from: 2, label: "Anion gap", value: "26", unit: "mEq/L", flag: "H" },
  { from: 3, label: "Arterial pH", value: "7.14", flag: "L" },
  { from: 3, label: "PaCO2", value: "22", unit: "mm Hg", flag: "L" },
  { from: 3, label: "Beta-hydroxybutyrate", value: "6.8", unit: "mmol/L", flag: "H" },
  { from: 3, label: "White blood cells", value: "14,200", unit: "/mm3", flag: "H" },
  { from: 5, label: "Potassium, repeat at 1100", value: "4.1", unit: "mEq/L" },
  { from: 5, label: "Glucose, repeat at 1200", value: "362", unit: "mg/dL", flag: "H" },
  { from: 5, label: "Bicarbonate, repeat at 1200", value: "13", unit: "mEq/L", flag: "L" },
  { from: 6, label: "Potassium, repeat at 1400", value: "3.6", unit: "mEq/L" },
  { from: 6, label: "Glucose, repeat at 1400", value: "248", unit: "mg/dL", flag: "H" },
  { from: 6, label: "Bicarbonate, repeat at 1400", value: "18", unit: "mEq/L", flag: "L" },
  { from: 6, label: "Arterial pH, repeat at 1400", value: "7.31", flag: "L" },
  { from: 6, label: "Creatinine, repeat at 1400", value: "1.6", unit: "mg/dL", flag: "H" },
];

/** The provider's orders, first shown with step 3. */
const ORDERS: readonly { from: Step; text: string }[] = [
  { from: 3, text: "0945: 0.9% sodium chloride 1,000 mL IV over 1 hour, then 500 mL/h." },
  {
    from: 3,
    text: "0945: Regular insulin IV infusion at 0.1 units/kg/h, to start after the potassium result is reviewed.",
  },
  { from: 3, text: "0945: Fingerstick glucose every hour. Serum potassium every 2 hours." },
  { from: 3, text: "0945: Nothing by mouth except ice chips. Strict intake and output." },
  { from: 5, text: "1100: Add potassium chloride 20 mEq to each liter of IV fluid." },
  {
    from: 6,
    text: "1400: Change the IV fluid to 5% dextrose in 0.45% sodium chloride when the glucose is below 250 mg/dL.",
  },
  {
    from: 6,
    text: "1400: Give subcutaneous insulin 2 hours before the insulin infusion is stopped.",
  },
];

// ---------------------------------------------------------------------------
// The six questions
// ---------------------------------------------------------------------------

interface Choice {
  text: string;
  right: boolean;
}

type StepQuestion =
  | { kind: "select"; stem: string; choices: Choice[]; lettered: boolean }
  | { kind: "single"; stem: string; choices: Choice[] }
  | { kind: "matrix"; stem: string; heading: string; columns: [string, string]; rows: Choice[] };

const yes = (text: string): Choice => ({ text, right: true });
const no = (text: string): Choice => ({ text, right: false });

/** In a matrix, `right` means the first column is the answer; otherwise the second is. */
const QUESTIONS: readonly StepQuestion[] = [
  {
    kind: "select",
    lettered: false,
    stem: "The nurse reviews the client's record. Which findings require immediate follow-up? Select all that apply.",
    choices: [
      yes("Fingerstick glucose that reads HI"),
      yes("Respiratory rate 30/min with deep breaths"),
      yes("Heart rate 128/min"),
      yes("Blood pressure 94/58 mm Hg"),
      no("SpO2 98% on room air"),
      no("Temperature 37.4 °C"),
    ],
  },
  {
    kind: "single",
    stem: "Which condition is the client most likely experiencing?",
    choices: [
      no("Hypoglycemia"),
      yes("Diabetic ketoacidosis"),
      no("Hyperosmolar hyperglycemic state"),
      no("Viral gastroenteritis"),
    ],
  },
  {
    kind: "single",
    stem: "Which problem should the nurse address first?",
    choices: [
      no("Knowledge deficit about insulin pump site changes"),
      no("Abdominal pain rated 6 on a scale of 0 to 10"),
      yes("Fluid volume deficit"),
      no("Risk for skin breakdown"),
    ],
  },
  {
    kind: "matrix",
    stem: "For each prescription, indicate whether it is indicated or not indicated for the client at this time.",
    heading: "Prescription",
    columns: ["Indicated", "Not indicated"],
    rows: [
      yes("Give 0.9% sodium chloride 1,000 mL IV over 1 hour"),
      no("Start the regular insulin infusion before the potassium result is known"),
      yes("Check the fingerstick glucose every hour"),
      no("Give sodium bicarbonate by IV push"),
      yes("Keep the client on nothing by mouth except ice chips"),
    ],
  },
  {
    kind: "select",
    lettered: true,
    stem: "Which 3 actions should the nurse take at this time?",
    choices: [
      yes("Check the fingerstick glucose every hour"),
      no("Stop the insulin infusion because the glucose is falling"),
      yes("Keep the client on the cardiac monitor"),
      no("Give the client orange juice to drink"),
      yes("Add potassium chloride to the IV fluid as prescribed"),
      no("Remove one of the two IV catheters"),
    ],
  },
  {
    kind: "matrix",
    stem: "For each finding, indicate whether it shows that the client's condition has improved or has not improved.",
    heading: "Finding",
    columns: ["Improved", "Not improved"],
    rows: [
      yes("Glucose 248 mg/dL"),
      yes("Arterial pH 7.31"),
      yes("Heart rate 92/min"),
      no("Creatinine 1.6 mg/dL"),
      yes("Oriented to person, place and time"),
    ],
  },
];

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

const shownAt = <T extends { from: Step }>(entries: readonly T[], step: Step): T[] =>
  entries.filter((entry) => entry.from <= step);

const labLine = (lab: Lab): string =>
  `- ${lab.label}: ${lab.value}${lab.unit ? ` ${lab.unit}` : ""}${lab.flag ? ` (${lab.flag})` : ""}`;

function vitalsTable(step: Step): string {
  const columns = shownAt(VITALS, step);
  const row = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [
    row(["", ...columns.map((column) => column.time)]),
    row(["---", ...columns.map(() => "---")]),
    ...VITAL_ROWS.map((name, at) => row([name, ...columns.map((column) => column.values[at])])),
  ].join("\n");
}

const star = (choice: Choice): string => (choice.right ? `${choice.text} *` : choice.text);

function questionBlocks(question: StepQuestion): string[] {
  if (question.kind === "matrix") {
    const row = (cells: string[]) => `| ${cells.join(" | ")} |`;
    return [
      question.stem,
      [
        row([question.heading, ...question.columns]),
        row(["---", "---", "---"]),
        ...question.rows.map((entry) =>
          row([entry.text, entry.right ? "*" : "", entry.right ? "" : "*"]),
        ),
      ].join("\n"),
    ];
  }
  const lettered = question.kind === "single" || question.lettered;
  const lines = question.choices.map((choice, at) =>
    lettered ? `${String.fromCharCode(65 + at)}. ${star(choice)}` : `- ${star(choice)}`,
  );
  return [question.stem, lines.join("\n")];
}

/** One step as the document prints it: its heading, the record so far, then the question. */
function stepBlocks(step: Step): string[] {
  const labs = shownAt(LABS, step);
  const orders = shownAt(ORDERS, step);
  return [
    `## ${CASE_TITLE}, Question ${step} of 6`,
    "**History and Physical**",
    ...HISTORY,
    "**Nurses' Notes**",
    ...shownAt(NOTES, step).map((note) => note.text),
    "**Vital Signs**",
    vitalsTable(step),
    // The laboratory tab is printed from the start, with nothing under it until results come.
    "**Laboratory Results**",
    ...(labs.length > 0 ? [labs.map(labLine).join("\n")] : []),
    ...(orders.length > 0 ? ["**Provider Orders**", ...orders.map((order) => order.text)] : []),
    "**Question**",
    ...questionBlocks(QUESTIONS[step - 1]),
  ];
}

// ---------------------------------------------------------------------------
// The drafts a faithful model returns
// ---------------------------------------------------------------------------

function chartAt(step: Step) {
  const columns = shownAt(VITALS, step);
  const labs = shownAt(LABS, step);
  const orders = shownAt(ORDERS, step);
  const text = (paragraphs: string[]) => [{ kind: "text", text: paragraphs.join("\n\n") }];
  return {
    tabs: [
      { title: "History and Physical", sections: text(HISTORY) },
      { title: "Nurses' Notes", sections: text(shownAt(NOTES, step).map((note) => note.text)) },
      {
        title: "Vital Signs",
        sections: [
          {
            kind: "table",
            columns: ["", ...columns.map((column) => column.time)],
            rows: VITAL_ROWS.map((name, at) => [
              name,
              ...columns.map((column) => column.values[at]),
            ]),
          },
        ],
      },
      {
        title: "Laboratory Results",
        sections:
          labs.length === 0
            ? []
            : [
                {
                  kind: "values",
                  rows: labs.map((lab) => ({
                    label: lab.label,
                    value: lab.value,
                    ...(lab.unit ? { unit: lab.unit } : {}),
                    ...(lab.flag ? { flag: lab.flag } : {}),
                  })),
                },
              ],
      },
      ...(orders.length > 0
        ? [{ title: "Provider Orders", sections: text(orders.map((order) => order.text)) }]
        : []),
    ],
  };
}

function stepDraft(question: StepQuestion): Record<string, unknown> {
  if (question.kind === "matrix") {
    return {
      type: "matrix_multiple_choice",
      stem: question.stem,
      columns: question.columns,
      rows: question.rows.map((entry) => ({
        text: entry.text,
        cells: entry.right ? ["*", ""] : ["", "*"],
      })),
    };
  }
  return {
    type: question.kind === "single" ? "multiple_choice" : "multiple_response",
    stem: question.stem,
    options: question.choices.map((choice) => ({ text: star(choice) })),
  };
}

/** Each step's stem, in order: how a test finds the steps in the document's chunks. */
export const caseStudyStems = (): string[] => QUESTIONS.map((question) => question.stem);

/** Each step's key as text, for the test that checks the expected file by hand. */
export const caseStudyKeys = (): string[][] =>
  QUESTIONS.map((question) =>
    question.kind === "matrix"
      ? question.rows.map((row) => `${row.text} → ${question.columns[row.right ? 0 : 1]}`)
      : question.choices.filter((choice) => choice.right).map((choice) => choice.text),
  );

export function caseStudyMd(): CorpusDocument {
  const text = [
    `# ${CASE_TITLE}`,
    NOTICE,
    `Patient: ${PATIENT.name}, ${PATIENT.age} years old, ${PATIENT.sex}. Setting: ${PATIENT.setting}.`,
    ...STEPS.flatMap(stepBlocks),
  ].join("\n\n");
  return {
    name: CASE_STUDY_MD,
    bytes: new TextEncoder().encode(`${text}\n`),
    // Converted once from the recording with the product's assembly and checked by hand, as the
    // other case studies' expected files were: a patient record is not typed out twice.
    expected: null,
    recording: {
      document: CASE_STUDY_MD,
      source: "generated",
      questions: [],
      caseStudies: [
        {
          draft: {
            title: CASE_TITLE,
            patient: PATIENT,
            charts: STEPS.map(chartAt),
            steps: QUESTIONS.map(stepDraft),
          },
        },
      ],
    },
  };
}

/** The opening of each step, as the segment pass copies it. */
export const caseStudyOpenings = (): string[] => caseStudyStems().map(openingOf);
