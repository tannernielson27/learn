import { SAMPLE_TAG, md, type ItemFixture } from "./types";

const text = (value: string) => ({ kind: "text" as const, value });
const blank = (blankId: string) => ({ kind: "blank" as const, blankId });

export const dropdownClozeFixture: ItemFixture<"dropdown_cloze"> = {
  type: "dropdown_cloze",
  canonical: {
    id: "ddc_sample_1",
    type: "dropdown_cloze",
    cjmmStep: 2,
    tags: [SAMPLE_TAG, "renal"],
    stem: md("Complete the following sentence by choosing from the lists of options."),
    content: {
      tokens: [
        text("The client's serum potassium of 6.4 mEq/L places them at greatest risk for "),
        blank("blank_1"),
        text(", so the nurse should first "),
        blank("blank_2"),
        text("."),
      ],
      blanks: [
        {
          id: "blank_1",
          choices: [
            { id: "b1_a", label: "cardiac dysrhythmia" },
            { id: "b1_b", label: "seizure activity" },
            { id: "b1_c", label: "respiratory alkalosis" },
          ],
        },
        {
          id: "blank_2",
          choices: [
            { id: "b2_a", label: "obtain a 12-lead ECG" },
            { id: "b2_b", label: "encourage oral potassium-rich foods" },
            { id: "b2_c", label: "apply a warm compress" },
          ],
        },
      ],
    },
    answerKey: {
      blanks: [
        { blankId: "blank_1", correctChoiceId: "b1_a" },
        { blankId: "blank_2", correctChoiceId: "b2_a" },
      ],
    },
    scoring: { model: "zero_one", maxPoints: 2 },
    rationale: {
      general: md(
        "Hyperkalemia alters cardiac conduction; an ECG identifies peaked T waves or widened QRS before treatment.",
      ),
    },
  },
  edge: {
    id: "ddc_sample_single",
    type: "dropdown_cloze",
    tags: [SAMPLE_TAG],
    stem: md("Complete the sentence."),
    content: {
      tokens: [text("The antidote for an acetaminophen overdose is "), blank("b1"), text(".")],
      blanks: [
        {
          id: "b1",
          choices: [
            { id: "c_a", label: "naloxone" },
            { id: "c_b", label: "acetylcysteine" },
            { id: "c_c", label: "flumazenil" },
          ],
        },
      ],
    },
    answerKey: { blanks: [{ blankId: "b1", correctChoiceId: "c_b" }] },
    scoring: { model: "zero_one", maxPoints: 1 },
  },
  cases: [
    { name: "empty", response: { type: "dropdown_cloze", blanks: [] }, expectedPoints: 0 },
    {
      name: "both correct",
      response: {
        type: "dropdown_cloze",
        blanks: [
          { blankId: "blank_1", choiceId: "b1_a" },
          { blankId: "blank_2", choiceId: "b2_a" },
        ],
      },
      expectedPoints: 2,
    },
    {
      name: "one correct one wrong scores per blank",
      response: {
        type: "dropdown_cloze",
        blanks: [
          { blankId: "blank_1", choiceId: "b1_a" },
          { blankId: "blank_2", choiceId: "b2_c" },
        ],
      },
      expectedPoints: 1,
    },
  ],
};

export const dropdownRationaleFixture: ItemFixture<"dropdown_rationale"> = {
  type: "dropdown_rationale",
  canonical: {
    id: "ddr_sample_1",
    type: "dropdown_rationale",
    cjmmStep: 3,
    tags: [SAMPLE_TAG, "obstetric"],
    stem: md("Complete the following sentence by choosing from the lists of options."),
    content: {
      tokens: [
        text("The client is at highest risk for "),
        blank("cond"),
        text(" as evidenced by "),
        blank("ev_1"),
        text(" and "),
        blank("ev_2"),
        text("."),
      ],
      blanks: [
        {
          id: "cond",
          choices: [
            { id: "cond_a", label: "postpartum hemorrhage" },
            { id: "cond_b", label: "puerperal infection" },
            { id: "cond_c", label: "pulmonary embolism" },
          ],
        },
        {
          id: "ev_1",
          choices: [
            { id: "ev1_a", label: "a boggy fundus above the umbilicus" },
            { id: "ev1_b", label: "a temperature of 37.6 °C" },
            { id: "ev1_c", label: "calf tenderness" },
          ],
        },
        {
          id: "ev_2",
          choices: [
            { id: "ev2_a", label: "saturating a pad in 15 minutes" },
            { id: "ev2_b", label: "foul-smelling lochia" },
            { id: "ev2_c", label: "sudden dyspnea" },
          ],
        },
      ],
    },
    answerKey: {
      anchorBlankId: "cond",
      blanks: [
        { blankId: "cond", correctChoiceId: "cond_a" },
        { blankId: "ev_1", correctChoiceId: "ev1_a" },
        { blankId: "ev_2", correctChoiceId: "ev2_a" },
      ],
    },
    scoring: { model: "rationale", maxPoints: 2 },
    rationale: {
      general: md(
        "Uterine atony (boggy fundus) with heavy bleeding is the leading cause of early postpartum hemorrhage.",
      ),
      perElement: {
        cond: md(
          "The anchor. Infection and embolism are real risks after birth, but neither explains a boggy fundus with brisk bleeding.",
        ),
        ev_1: md(
          "A fundus that is soft and riding high is a uterus not clamping down on its own vessels.",
        ),
        ev_2: md("Saturating a pad in 15 minutes is the rate that turns bleeding into hemorrhage."),
      },
    },
  },
  edge: {
    id: "ddr_sample_dyad",
    type: "dropdown_rationale",
    tags: [SAMPLE_TAG],
    stem: md("Complete the sentence."),
    content: {
      tokens: [
        text("The client is experiencing "),
        blank("b1"),
        text(" due to "),
        blank("b2"),
        text("."),
      ],
      blanks: [
        {
          id: "b1",
          choices: [
            { id: "b1_a", label: "orthostatic hypotension" },
            { id: "b1_b", label: "hypertensive crisis" },
            { id: "b1_c", label: "bradycardia" },
          ],
        },
        {
          id: "b2",
          choices: [
            { id: "b2_a", label: "volume depletion" },
            { id: "b2_b", label: "caffeine intake" },
            { id: "b2_c", label: "vagal stimulation" },
          ],
        },
      ],
    },
    answerKey: {
      blanks: [
        { blankId: "b1", correctChoiceId: "b1_a" },
        { blankId: "b2", correctChoiceId: "b2_a" },
      ],
    },
    scoring: { model: "rationale", maxPoints: 1 },
  },
  cases: [
    { name: "empty", response: { type: "dropdown_rationale", blanks: [] }, expectedPoints: 0 },
    {
      name: "triad all correct",
      response: {
        type: "dropdown_rationale",
        blanks: [
          { blankId: "cond", choiceId: "cond_a" },
          { blankId: "ev_1", choiceId: "ev1_a" },
          { blankId: "ev_2", choiceId: "ev2_a" },
        ],
      },
      expectedPoints: 2,
    },
    {
      name: "triad anchor wrong scores zero",
      response: {
        type: "dropdown_rationale",
        blanks: [
          { blankId: "cond", choiceId: "cond_b" },
          { blankId: "ev_1", choiceId: "ev1_a" },
          { blankId: "ev_2", choiceId: "ev2_a" },
        ],
      },
      expectedPoints: 0,
    },
    {
      name: "triad anchor right one supporter wrong",
      response: {
        type: "dropdown_rationale",
        blanks: [
          { blankId: "cond", choiceId: "cond_a" },
          { blankId: "ev_1", choiceId: "ev1_b" },
          { blankId: "ev_2", choiceId: "ev2_a" },
        ],
      },
      expectedPoints: 1,
    },
  ],
};

export const dropdownTableFixture: ItemFixture<"dropdown_table"> = {
  type: "dropdown_table",
  canonical: {
    id: "ddt_sample_1",
    type: "dropdown_table",
    cjmmStep: 4,
    tags: [SAMPLE_TAG, "pharmacology"],
    stem: md(
      "For each medication, select the most important nursing action before administration.",
    ),
    content: {
      columns: { label: "Medication", dropdown: "Nursing action" },
      rows: [
        {
          id: "row_digoxin",
          label: "Digoxin 0.125 mg PO",
          choices: [
            { id: "dig_a", label: "Check apical pulse for one full minute" },
            { id: "dig_b", label: "Check blood glucose" },
            { id: "dig_c", label: "Assess pain level" },
          ],
        },
        {
          id: "row_insulin",
          label: "Insulin lispro 4 units subcut",
          choices: [
            { id: "ins_a", label: "Check blood glucose and confirm meal is available" },
            { id: "ins_b", label: "Check apical pulse" },
            { id: "ins_c", label: "Hold if systolic BP below 100" },
          ],
        },
        {
          id: "row_metoprolol",
          label: "Metoprolol 25 mg PO",
          choices: [
            { id: "met_a", label: "Assess blood pressure and heart rate" },
            { id: "met_b", label: "Check serum potassium" },
            { id: "met_c", label: "Check blood glucose" },
          ],
        },
      ],
    },
    answerKey: {
      rows: [
        { rowId: "row_digoxin", correctChoiceId: "dig_a" },
        { rowId: "row_insulin", correctChoiceId: "ins_a" },
        { rowId: "row_metoprolol", correctChoiceId: "met_a" },
      ],
    },
    scoring: { model: "zero_one", maxPoints: 3 },
    rationale: {
      general: md(
        "Each medication has a hold parameter tied to a specific assessment: heart rate for digoxin, glucose for insulin, blood pressure and heart rate for beta blockers.",
      ),
    },
  },
  edge: {
    id: "ddt_sample_edge",
    type: "dropdown_table",
    tags: [SAMPLE_TAG],
    stem: md("For each lab value, select the interpretation."),
    content: {
      columns: { label: "Result", dropdown: "Interpretation" },
      rows: [
        {
          id: "r1",
          label: "Potassium 2.9 mEq/L",
          choices: [
            { id: "r1_low", label: "Low" },
            { id: "r1_high", label: "High" },
          ],
        },
        {
          id: "r2",
          label: "Sodium 149 mEq/L",
          choices: [
            { id: "r2_low", label: "Low" },
            { id: "r2_high", label: "High" },
          ],
        },
      ],
    },
    answerKey: {
      rows: [
        { rowId: "r1", correctChoiceId: "r1_low" },
        { rowId: "r2", correctChoiceId: "r2_high" },
      ],
    },
    scoring: { model: "zero_one", maxPoints: 2 },
  },
  cases: [
    { name: "empty", response: { type: "dropdown_table", rows: [] }, expectedPoints: 0 },
    {
      name: "all correct",
      response: {
        type: "dropdown_table",
        rows: [
          { rowId: "row_digoxin", choiceId: "dig_a" },
          { rowId: "row_insulin", choiceId: "ins_a" },
          { rowId: "row_metoprolol", choiceId: "met_a" },
        ],
      },
      expectedPoints: 3,
    },
    {
      name: "one wrong",
      response: {
        type: "dropdown_table",
        rows: [
          { rowId: "row_digoxin", choiceId: "dig_b" },
          { rowId: "row_insulin", choiceId: "ins_a" },
          { rowId: "row_metoprolol", choiceId: "met_a" },
        ],
      },
      expectedPoints: 2,
    },
  ],
};

export const dragdropClozeFixture: ItemFixture<"dragdrop_cloze"> = {
  type: "dragdrop_cloze",
  canonical: {
    id: "dcz_sample_1",
    type: "dragdrop_cloze",
    cjmmStep: 5,
    tags: [SAMPLE_TAG, "respiratory"],
    stem: md("Drag words from the choices below to fill in each blank in the following sentence."),
    content: {
      tokens: [
        text("For a client with an acute asthma exacerbation, the nurse should first administer "),
        blank("blank_1"),
        text(" and then position the client in "),
        blank("blank_2"),
        text("."),
      ],
      blanks: [{ id: "blank_1" }, { id: "blank_2" }],
      bank: [
        { id: "tok_saba", label: "a short-acting beta agonist" },
        { id: "tok_ics", label: "an inhaled corticosteroid" },
        { id: "tok_fowler", label: "high Fowler position" },
        { id: "tok_supine", label: "supine position" },
        { id: "tok_anti", label: "an antihistamine" },
      ],
    },
    answerKey: {
      blanks: [
        { blankId: "blank_1", correctTokenId: "tok_saba" },
        { blankId: "blank_2", correctTokenId: "tok_fowler" },
      ],
    },
    scoring: { model: "zero_one", maxPoints: 2 },
    rationale: {
      general: md(
        "Rescue bronchodilation comes first; upright positioning maximizes chest expansion.",
      ),
    },
  },
  edge: {
    id: "dcz_sample_reusable",
    type: "dragdrop_cloze",
    tags: [SAMPLE_TAG],
    stem: md("Fill in each blank."),
    content: {
      tokens: [
        text("Normal adult resting heart rate is "),
        blank("b1"),
        text(" to "),
        blank("b2"),
        text(" beats per minute."),
      ],
      blanks: [{ id: "b1" }, { id: "b2" }],
      bank: [
        { id: "t40", label: "40" },
        { id: "t60", label: "60" },
        { id: "t100", label: "100" },
        { id: "t120", label: "120" },
      ],
      reusable: true,
    },
    answerKey: {
      blanks: [
        { blankId: "b1", correctTokenId: "t60" },
        { blankId: "b2", correctTokenId: "t100" },
      ],
    },
    scoring: { model: "zero_one", maxPoints: 2 },
  },
  cases: [
    { name: "empty", response: { type: "dragdrop_cloze", blanks: [] }, expectedPoints: 0 },
    {
      name: "both correct",
      response: {
        type: "dragdrop_cloze",
        blanks: [
          { blankId: "blank_1", tokenId: "tok_saba" },
          { blankId: "blank_2", tokenId: "tok_fowler" },
        ],
      },
      expectedPoints: 2,
    },
    {
      name: "swapped tokens",
      response: {
        type: "dragdrop_cloze",
        blanks: [
          { blankId: "blank_1", tokenId: "tok_fowler" },
          { blankId: "blank_2", tokenId: "tok_saba" },
        ],
      },
      expectedPoints: 0,
    },
  ],
};

export const dragdropRationaleFixture: ItemFixture<"dragdrop_rationale"> = {
  type: "dragdrop_rationale",
  canonical: {
    id: "dcr_sample_1",
    type: "dragdrop_rationale",
    cjmmStep: 3,
    tags: [SAMPLE_TAG, "surgical"],
    stem: md("Drag words from the choices below to fill in each blank in the following sentence."),
    content: {
      tokens: [
        text("The client who is two days post-operative is most likely experiencing "),
        blank("cond"),
        text(" due to "),
        blank("cause"),
        text("."),
      ],
      blanks: [{ id: "cond" }, { id: "cause" }],
      bank: [
        { id: "tok_atelectasis", label: "atelectasis" },
        { id: "tok_pe", label: "pulmonary embolism" },
        { id: "tok_shallow", label: "shallow breathing from incisional pain" },
        { id: "tok_immobility", label: "prolonged immobility" },
      ],
    },
    answerKey: {
      blanks: [
        { blankId: "cond", correctTokenId: "tok_atelectasis" },
        { blankId: "cause", correctTokenId: "tok_shallow" },
      ],
    },
    scoring: { model: "rationale", maxPoints: 1 },
    rationale: {
      general: md(
        "Low-grade fever, diminished bases, and splinting on day two are classic for atelectasis from hypoventilation.",
      ),
    },
  },
  edge: {
    id: "dcr_sample_triad",
    type: "dragdrop_rationale",
    tags: [SAMPLE_TAG],
    stem: md("Fill in each blank."),
    content: {
      tokens: [
        text("The client is at risk for "),
        blank("cond"),
        text(" as evidenced by "),
        blank("ev1"),
        text(" and "),
        blank("ev2"),
        text("."),
      ],
      blanks: [{ id: "cond" }, { id: "ev1" }, { id: "ev2" }],
      bank: [
        { id: "t_dvt", label: "deep vein thrombosis" },
        { id: "t_calf", label: "unilateral calf swelling" },
        { id: "t_immob", label: "immobility" },
        { id: "t_fever", label: "high fever" },
        { id: "t_wheeze", label: "wheezing" },
      ],
    },
    answerKey: {
      anchorBlankId: "cond",
      blanks: [
        { blankId: "cond", correctTokenId: "t_dvt" },
        { blankId: "ev1", correctTokenId: "t_calf" },
        { blankId: "ev2", correctTokenId: "t_immob" },
      ],
    },
    scoring: { model: "rationale", maxPoints: 2 },
  },
  cases: [
    { name: "empty", response: { type: "dragdrop_rationale", blanks: [] }, expectedPoints: 0 },
    {
      name: "dyad both correct",
      response: {
        type: "dragdrop_rationale",
        blanks: [
          { blankId: "cond", tokenId: "tok_atelectasis" },
          { blankId: "cause", tokenId: "tok_shallow" },
        ],
      },
      expectedPoints: 1,
    },
    {
      name: "dyad half right scores zero",
      response: {
        type: "dragdrop_rationale",
        blanks: [
          { blankId: "cond", tokenId: "tok_atelectasis" },
          { blankId: "cause", tokenId: "tok_immobility" },
        ],
      },
      expectedPoints: 0,
    },
  ],
};
