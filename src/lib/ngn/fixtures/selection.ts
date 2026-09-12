import { SAMPLE_TAG, md, type ItemFixture } from "./types";

export const multipleChoiceFixture: ItemFixture<"multiple_choice"> = {
  type: "multiple_choice",
  canonical: {
    id: "mc_sample_1",
    type: "multiple_choice",
    cjmmStep: 5,
    tags: [SAMPLE_TAG, "cardiac"],
    stem: md(
      "A client with heart failure reports gaining 2.3 kg (5 lb) in two days and new shortness of breath when lying flat. Which action should the nurse take first?",
    ),
    content: {
      options: [
        { id: "opt_a", label: "Auscultate the lungs and assess oxygen saturation" },
        { id: "opt_b", label: "Encourage the client to increase oral fluids" },
        { id: "opt_c", label: "Document the weight and reassess tomorrow" },
        { id: "opt_d", label: "Teach the client about low-sodium food choices" },
      ],
    },
    answerKey: { correctOptionId: "opt_a" },
    scoring: { model: "zero_one", maxPoints: 1 },
    rationale: {
      general: md(
        "Rapid weight gain with orthopnea suggests fluid overload. Assessment of respiratory status comes before teaching, documentation, or fluid changes.",
      ),
      perElement: {
        opt_a: md(
          "Assessment comes first: lung sounds and saturation say how far the overload has gone and how urgently it must be treated.",
        ),
        opt_b: md("More fluid worsens an already overloaded circulation."),
        opt_c: md(
          "Documenting without assessing leaves a deteriorating client unattended for a day.",
        ),
        opt_d: md("Teaching matters, but not before the client can breathe lying down."),
      },
    },
  },
  edge: {
    id: "mc_sample_edge",
    type: "multiple_choice",
    tags: [SAMPLE_TAG],
    stem: md("Which finding is most consistent with hypoglycemia?"),
    content: {
      options: [
        { id: "opt_a", label: "Fruity breath odor" },
        { id: "opt_b", label: "Diaphoresis and tremor" },
        { id: "opt_c", label: "Polyuria" },
        { id: "opt_d", label: "Kussmaul respirations" },
        { id: "opt_e", label: "Warm, flushed skin" },
        { id: "opt_f", label: "Excessive thirst" },
      ],
    },
    answerKey: { correctOptionId: "opt_b" },
    scoring: { model: "zero_one", maxPoints: 1 },
    rationale: {
      general: md(
        "Diaphoresis and tremor are the adrenergic response to a falling glucose. Fruity breath, Kussmaul respirations, polyuria, excessive thirst and warm flushed skin all belong to hyperglycemia.",
      ),
    },
  },
  cases: [
    { name: "empty", response: { type: "multiple_choice" }, expectedPoints: 0 },
    {
      name: "correct",
      response: { type: "multiple_choice", optionId: "opt_a" },
      expectedPoints: 1,
    },
    { name: "wrong", response: { type: "multiple_choice", optionId: "opt_c" }, expectedPoints: 0 },
  ],
};

export const multipleResponseFixture: ItemFixture<"multiple_response"> = {
  type: "multiple_response",
  canonical: {
    id: "mr_sample_1",
    type: "multiple_response",
    cjmmStep: 1,
    tags: [SAMPLE_TAG, "respiratory"],
    stem: md(
      "A 68-year-old client is admitted with community-acquired pneumonia. Which findings require immediate follow-up by the nurse?",
    ),
    instructions: "Select all that apply.",
    content: {
      variant: "sata",
      options: [
        { id: "opt_a", label: "Respiratory rate 28 breaths/min" },
        { id: "opt_b", label: "Oxygen saturation 89% on room air" },
        { id: "opt_c", label: "Temperature 37.2 °C (99 °F)" },
        { id: "opt_d", label: "New confusion per family" },
        { id: "opt_e", label: "Productive cough with yellow sputum" },
        { id: "opt_f", label: "Blood pressure 118/74 mm Hg" },
      ],
    },
    answerKey: { correctOptionIds: ["opt_a", "opt_b", "opt_d"] },
    scoring: { model: "plus_minus", maxPoints: 3 },
    rationale: {
      general: md(
        "Tachypnea, hypoxemia, and new confusion indicate worsening gas exchange and possible sepsis. Low-grade temperature, productive cough, and a normal blood pressure are expected findings.",
      ),
      perElement: {
        opt_a: md("A rate of 28 is the body working harder to hold its gas exchange together."),
        opt_b: md("89% on room air is hypoxemia and needs oxygen now."),
        opt_c: md("37.2 °C is barely raised and expected with pneumonia."),
        opt_d: md("New confusion in an older adult is often the first sign of sepsis, not of age."),
        opt_e: md(
          "A productive cough is what pneumonia does; on its own it is not a deterioration.",
        ),
        opt_f: md("118/74 is a normal pressure and reassuring here."),
      },
    },
  },
  edge: {
    id: "mr_sample_select_n",
    type: "multiple_response",
    tags: [SAMPLE_TAG],
    stem: md("Which three interventions are priorities for a client with suspected sepsis?"),
    instructions: "Select the 3 priority interventions.",
    content: {
      variant: "select_n",
      n: 3,
      options: [
        { id: "opt_a", label: "Obtain blood cultures before antibiotics" },
        { id: "opt_b", label: "Administer prescribed broad-spectrum antibiotics" },
        { id: "opt_c", label: "Begin intravenous fluid resuscitation" },
        { id: "opt_d", label: "Apply sequential compression devices" },
        { id: "opt_e", label: "Provide a regular diet" },
      ],
    },
    answerKey: { correctOptionIds: ["opt_a", "opt_b", "opt_c"] },
    scoring: { model: "plus_minus", maxPoints: 3 },
    rationale: {
      general: md(
        "Cultures before antibiotics, antibiotics without delay, and fluid for the pressure are the first hour of sepsis care. Compression devices and diet matter later.",
      ),
    },
  },
  cases: [
    { name: "empty", response: { type: "multiple_response", optionIds: [] }, expectedPoints: 0 },
    {
      name: "all correct",
      response: { type: "multiple_response", optionIds: ["opt_a", "opt_b", "opt_d"] },
      expectedPoints: 3,
    },
    {
      name: "two correct one wrong",
      response: { type: "multiple_response", optionIds: ["opt_a", "opt_b", "opt_c"] },
      expectedPoints: 1,
    },
    {
      name: "over-selection floors at zero",
      response: { type: "multiple_response", optionIds: ["opt_a", "opt_c", "opt_e", "opt_f"] },
      expectedPoints: 0,
    },
    {
      name: "all wrong",
      response: { type: "multiple_response", optionIds: ["opt_c", "opt_e", "opt_f"] },
      expectedPoints: 0,
    },
  ],
};

export const multipleResponseGroupingFixture: ItemFixture<"multiple_response_grouping"> = {
  type: "multiple_response_grouping",
  canonical: {
    id: "mrg_sample_1",
    type: "multiple_response_grouping",
    cjmmStep: 2,
    tags: [SAMPLE_TAG, "endocrine"],
    stem: md(
      "A client with type 1 diabetes is admitted with nausea, vomiting, and a blood glucose of 486 mg/dL. For each body system, select the findings that support diabetic ketoacidosis.",
    ),
    instructions: "Each body system may support more than one finding.",
    content: {
      rows: [
        {
          id: "row_resp",
          label: "Respiratory",
          options: [
            { id: "resp_a", label: "Deep, rapid respirations" },
            { id: "resp_b", label: "Fruity breath odor" },
            { id: "resp_c", label: "Bilateral wheezes" },
          ],
        },
        {
          id: "row_cv",
          label: "Cardiovascular",
          options: [
            { id: "cv_a", label: "Heart rate 118 beats/min" },
            { id: "cv_b", label: "Bounding peripheral pulses" },
            { id: "cv_c", label: "Blood pressure 92/56 mm Hg" },
          ],
        },
        {
          id: "row_neuro",
          label: "Neurologic",
          options: [
            { id: "neuro_a", label: "Drowsiness" },
            { id: "neuro_b", label: "Pupils 6 mm and sluggish" },
          ],
        },
      ],
    },
    answerKey: {
      rows: [
        { rowId: "row_resp", correctOptionIds: ["resp_a", "resp_b"] },
        { rowId: "row_cv", correctOptionIds: ["cv_a", "cv_c"] },
        { rowId: "row_neuro", correctOptionIds: ["neuro_a"] },
      ],
    },
    scoring: { model: "plus_minus", maxPoints: 5 },
    rationale: {
      general: md(
        "Kussmaul respirations and acetone breath reflect metabolic acidosis; tachycardia and hypotension reflect osmotic fluid loss; drowsiness reflects hyperosmolarity.",
      ),
    },
  },
  edge: {
    id: "mrg_sample_edge",
    type: "multiple_response_grouping",
    tags: [SAMPLE_TAG],
    stem: md("For each category, select the findings consistent with hypovolemic shock."),
    content: {
      rows: [
        {
          id: "r1",
          label: "Vital signs",
          options: [
            { id: "r1_a", label: "Heart rate 132 beats/min" },
            { id: "r1_b", label: "Blood pressure 84/50 mm Hg" },
          ],
        },
        {
          id: "r2",
          label: "Skin",
          options: [
            { id: "r2_a", label: "Cool and clammy" },
            { id: "r2_b", label: "Warm and flushed" },
          ],
        },
      ],
    },
    answerKey: {
      rows: [
        { rowId: "r1", correctOptionIds: ["r1_a", "r1_b"] },
        { rowId: "r2", correctOptionIds: ["r2_a"] },
      ],
    },
    scoring: { model: "plus_minus", maxPoints: 3 },
    rationale: {
      general: md(
        "Compensating for lost volume raises the heart rate, drops the pressure, and shunts blood away from the skin, leaving it cool and clammy. Warm, flushed skin belongs to distributive shock.",
      ),
    },
  },
  cases: [
    {
      name: "empty",
      response: { type: "multiple_response_grouping", rows: [] },
      expectedPoints: 0,
    },
    {
      name: "all correct",
      response: {
        type: "multiple_response_grouping",
        rows: [
          { rowId: "row_resp", optionIds: ["resp_a", "resp_b"] },
          { rowId: "row_cv", optionIds: ["cv_a", "cv_c"] },
          { rowId: "row_neuro", optionIds: ["neuro_a"] },
        ],
      },
      expectedPoints: 5,
    },
    {
      name: "one row over-selected floors that row only",
      response: {
        type: "multiple_response_grouping",
        rows: [
          { rowId: "row_resp", optionIds: ["resp_c"] },
          { rowId: "row_cv", optionIds: ["cv_a", "cv_c"] },
          { rowId: "row_neuro", optionIds: ["neuro_a", "neuro_b"] },
        ],
      },
      expectedPoints: 2,
    },
    {
      name: "unanswered rows score zero",
      response: {
        type: "multiple_response_grouping",
        rows: [{ rowId: "row_neuro", optionIds: ["neuro_a"] }],
      },
      expectedPoints: 1,
    },
  ],
};

export const matrixMultipleChoiceFixture: ItemFixture<"matrix_multiple_choice"> = {
  type: "matrix_multiple_choice",
  canonical: {
    id: "mmc_sample_1",
    type: "matrix_multiple_choice",
    cjmmStep: 4,
    tags: [SAMPLE_TAG, "gastrointestinal"],
    stem: md(
      "The nurse is planning care for a client admitted with acute pancreatitis. For each potential intervention, indicate whether it is indicated, contraindicated, or non-essential.",
    ),
    content: {
      rows: [
        { id: "row_npo", label: "Keep the client NPO initially" },
        { id: "row_morphine", label: "Administer prescribed IV opioid analgesia" },
        { id: "row_diet", label: "Offer a high-fat diet to stimulate appetite" },
        {
          id: "row_position",
          label: "Position the client side-lying with knees flexed, or sitting and leaning forward",
        },
        { id: "row_sodium", label: "Teach about a low-sodium diet" },
      ],
      columns: [
        { id: "col_ind", label: "Indicated" },
        { id: "col_contra", label: "Contraindicated" },
        { id: "col_non", label: "Non-essential" },
      ],
    },
    answerKey: {
      rows: [
        { rowId: "row_npo", correctColumnId: "col_ind" },
        { rowId: "row_morphine", correctColumnId: "col_ind" },
        { rowId: "row_diet", correctColumnId: "col_contra" },
        { rowId: "row_position", correctColumnId: "col_ind" },
        { rowId: "row_sodium", correctColumnId: "col_non" },
      ],
    },
    scoring: { model: "zero_one", maxPoints: 5 },
    rationale: {
      general: md(
        "Resting the pancreas, controlling pain, and comfort positioning are indicated. Dietary fat stimulates pancreatic secretion and is contraindicated during the acute phase.",
      ),
      perElement: {
        row_npo: md("Nothing by mouth rests the pancreas, which is the whole aim of early care."),
        row_morphine: md(
          "Pancreatic pain is severe and is treated; withholding opioids on old sphincter-of-Oddi reasoning is no longer supported.",
        ),
        row_diet: md(
          "Fat is the strongest stimulus to pancreatic secretion, which is exactly what must be avoided.",
        ),
        row_position: md(
          "Flexing the knees or leaning forward eases the stretch on an inflamed pancreas.",
        ),
        row_sodium: md(
          "Not harmful, but sodium is not the concern in pancreatitis; fat is, and diet teaching waits until the client eats again.",
        ),
      },
    },
  },
  edge: {
    id: "mmc_sample_edge",
    type: "matrix_multiple_choice",
    tags: [SAMPLE_TAG],
    cjmmStep: 6,
    stem: md(
      "Before treatment the client's oxygen saturation was 89% on room air and the respiratory rate 24 breaths/min. For each finding, indicate whether the client's condition has improved or declined after treatment.",
    ),
    content: {
      rows: [
        { id: "r1", label: "Oxygen saturation 96% on room air" },
        { id: "r2", label: "Respiratory rate 32 breaths/min" },
      ],
      columns: [
        { id: "improved", label: "Improved" },
        { id: "declined", label: "Declined" },
      ],
    },
    answerKey: {
      rows: [
        { rowId: "r1", correctColumnId: "improved" },
        { rowId: "r2", correctColumnId: "declined" },
      ],
    },
    scoring: { model: "zero_one", maxPoints: 2 },
    rationale: {
      general: md(
        "A saturation of 96% on room air is a recovery. A respiratory rate of 32 is work the client is still having to do to hold it.",
      ),
    },
  },
  cases: [
    { name: "empty", response: { type: "matrix_multiple_choice", rows: [] }, expectedPoints: 0 },
    {
      name: "all correct",
      response: {
        type: "matrix_multiple_choice",
        rows: [
          { rowId: "row_npo", columnId: "col_ind" },
          { rowId: "row_morphine", columnId: "col_ind" },
          { rowId: "row_diet", columnId: "col_contra" },
          { rowId: "row_position", columnId: "col_ind" },
          { rowId: "row_sodium", columnId: "col_non" },
        ],
      },
      expectedPoints: 5,
    },
    {
      name: "two wrong rows and one unanswered",
      response: {
        type: "matrix_multiple_choice",
        rows: [
          { rowId: "row_npo", columnId: "col_ind" },
          { rowId: "row_morphine", columnId: "col_contra" },
          { rowId: "row_diet", columnId: "col_ind" },
          { rowId: "row_position", columnId: "col_ind" },
        ],
      },
      expectedPoints: 2,
    },
  ],
};

export const matrixMultipleResponseFixture: ItemFixture<"matrix_multiple_response"> = {
  type: "matrix_multiple_response",
  canonical: {
    id: "mmr_sample_1",
    type: "matrix_multiple_response",
    cjmmStep: 2,
    tags: [SAMPLE_TAG, "neurologic"],
    stem: md(
      "A client arrives with sudden right-sided weakness and slurred speech that began 40 minutes ago. For each finding, select every condition it is consistent with.",
    ),
    instructions: "Each row may have more than one selection.",
    content: {
      rows: [
        { id: "row_weak", label: "Unilateral weakness" },
        { id: "row_speech", label: "Slurred speech" },
        { id: "row_glucose", label: "Blood glucose 48 mg/dL" },
      ],
      columns: [
        { id: "col_stroke", label: "Ischemic stroke" },
        { id: "col_hypo", label: "Hypoglycemia" },
        { id: "col_migraine", label: "Migraine with aura" },
      ],
    },
    answerKey: {
      rows: [
        { rowId: "row_weak", correctColumnIds: ["col_stroke", "col_hypo", "col_migraine"] },
        { rowId: "row_speech", correctColumnIds: ["col_stroke", "col_hypo", "col_migraine"] },
        { rowId: "row_glucose", correctColumnIds: ["col_hypo"] },
      ],
    },
    scoring: { model: "plus_minus", maxPoints: 7 },
    rationale: {
      general: md(
        "Focal deficits occur in stroke, hypoglycemia, and migraine with aura. A glucose of 48 mg/dL points to hypoglycemia, which must be corrected before stroke treatment decisions.",
      ),
      perElement: {
        row_weak: md(
          "One-sided weakness fits a stroke, hypoglycemia mimics one closely enough to be mistaken for it, and a migraine aura can cause it too.",
        ),
        row_speech: md(
          "Slurred speech has the same three explanations: stroke, hypoglycemia, or a migraine aura. A stroke has to be ruled out first.",
        ),
        row_glucose: md(
          "A glucose of 48 belongs to hypoglycemia alone, and it is the one of the three that can be corrected in minutes.",
        ),
      },
    },
  },
  edge: {
    id: "mmr_sample_edge",
    type: "matrix_multiple_response",
    tags: [SAMPLE_TAG],
    stem: md("For each medication, select every monitoring parameter that applies."),
    content: {
      rows: [
        { id: "r1", label: "Warfarin" },
        { id: "r2", label: "Furosemide" },
      ],
      columns: [
        { id: "c1", label: "INR" },
        { id: "c2", label: "Serum potassium" },
        { id: "c3", label: "Daily weight" },
        { id: "c4", label: "Signs of bleeding" },
      ],
    },
    answerKey: {
      rows: [
        { rowId: "r1", correctColumnIds: ["c1", "c4"] },
        { rowId: "r2", correctColumnIds: ["c2", "c3"] },
      ],
    },
    scoring: { model: "plus_minus", maxPoints: 4 },
    rationale: {
      general: md(
        "Warfarin is followed by the INR and by looking for bleeding. Furosemide takes potassium with the water it removes, so potassium and daily weight follow it.",
      ),
    },
  },
  cases: [
    { name: "empty", response: { type: "matrix_multiple_response", rows: [] }, expectedPoints: 0 },
    {
      name: "all correct",
      response: {
        type: "matrix_multiple_response",
        rows: [
          { rowId: "row_weak", columnIds: ["col_stroke", "col_hypo", "col_migraine"] },
          { rowId: "row_speech", columnIds: ["col_stroke", "col_hypo", "col_migraine"] },
          { rowId: "row_glucose", columnIds: ["col_hypo"] },
        ],
      },
      expectedPoints: 7,
    },
    {
      name: "wrong extra in one row subtracts within that row",
      response: {
        type: "matrix_multiple_response",
        rows: [
          { rowId: "row_weak", columnIds: ["col_stroke", "col_hypo", "col_migraine"] },
          { rowId: "row_speech", columnIds: ["col_stroke", "col_hypo", "col_migraine"] },
          { rowId: "row_glucose", columnIds: ["col_hypo", "col_stroke"] },
        ],
      },
      expectedPoints: 6,
    },
  ],
};
