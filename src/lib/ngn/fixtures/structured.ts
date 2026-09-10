import { SAMPLE_TAG, md, type ItemFixture } from "./types";

const t = (value: string) => ({ kind: "text" as const, value });
const s = (spanId: string, value: string) => ({ kind: "span" as const, spanId, value });

export const highlightTextFixture: ItemFixture<"highlight_text"> = {
  type: "highlight_text",
  canonical: {
    id: "ht_sample_1",
    type: "highlight_text",
    cjmmStep: 1,
    tags: [SAMPLE_TAG, "cardiac"],
    stem: md("Click to highlight the findings in the nurses' note that require follow-up."),
    content: {
      passage: [
        t(
          "0730: 71-year-old client admitted overnight with chest pain. Reports pain is now 2/10. ",
        ),
        s("sp_hr", "Heart rate 54 and irregular"),
        t(". "),
        s("sp_bp", "Blood pressure 128/78"),
        t(". "),
        s("sp_sat", "Oxygen saturation 91% on 2 L nasal cannula"),
        t(". "),
        s("sp_skin", "Skin warm and dry"),
        t(". "),
        s("sp_urine", "Urine output 15 mL over the past hour"),
        t(". Client ambulated to the bathroom with one assist."),
      ],
    },
    answerKey: { correctSpanIds: ["sp_hr", "sp_sat", "sp_urine"] },
    scoring: { model: "plus_minus", maxPoints: 3 },
    rationale: {
      general: md(
        "Bradycardia with irregularity, hypoxemia on oxygen, and oliguria signal reduced cardiac output.",
      ),
    },
  },
  edge: {
    id: "ht_sample_edge",
    type: "highlight_text",
    tags: [SAMPLE_TAG],
    stem: md("Highlight the abnormal findings."),
    content: {
      passage: [s("a", "Temperature 39.4 °C"), t(", "), s("b", "respirations 16"), t(".")],
    },
    answerKey: { correctSpanIds: ["a"] },
    scoring: { model: "plus_minus", maxPoints: 1 },
  },
  cases: [
    { name: "empty", response: { type: "highlight_text", spanIds: [] }, expectedPoints: 0 },
    {
      name: "all correct",
      response: { type: "highlight_text", spanIds: ["sp_hr", "sp_sat", "sp_urine"] },
      expectedPoints: 3,
    },
    {
      name: "one extra",
      response: { type: "highlight_text", spanIds: ["sp_hr", "sp_sat", "sp_urine", "sp_bp"] },
      expectedPoints: 2,
    },
    {
      name: "everything selected",
      response: {
        type: "highlight_text",
        spanIds: ["sp_hr", "sp_bp", "sp_sat", "sp_skin", "sp_urine"],
      },
      expectedPoints: 1,
    },
  ],
};

export const highlightTableFixture: ItemFixture<"highlight_table"> = {
  type: "highlight_table",
  canonical: {
    id: "htb_sample_1",
    type: "highlight_table",
    cjmmStep: 1,
    tags: [SAMPLE_TAG, "pediatric"],
    stem: md("Click to highlight the assessment findings that indicate the child is dehydrated."),
    content: {
      columns: ["Body system", "Findings"],
      scorePerRow: true,
      rows: [
        {
          id: "row_general",
          cells: [
            [t("General")],
            [s("g1", "Lethargic, difficult to arouse"), t("; "), s("g2", "afebrile")],
          ],
        },
        {
          id: "row_skin",
          cells: [
            [t("Skin and mucous membranes")],
            [
              s("s1", "Capillary refill 4 seconds"),
              t("; "),
              s("s2", "dry, cracked lips"),
              t("; "),
              s("s3", "no rash"),
            ],
          ],
        },
        {
          id: "row_renal",
          cells: [
            [t("Renal")],
            [s("r1", "Two wet diapers in 24 hours"), t("; "), s("r2", "urine pale yellow")],
          ],
        },
      ],
    },
    answerKey: { correctSpanIds: ["g1", "s1", "s2", "r1"] },
    scoring: { model: "plus_minus", maxPoints: 4 },
    rationale: {
      general: md(
        "Altered responsiveness, delayed capillary refill, dry mucosa, and low urine output are signs of moderate to severe dehydration.",
      ),
    },
  },
  edge: {
    id: "htb_sample_whole",
    type: "highlight_table",
    tags: [SAMPLE_TAG],
    stem: md("Highlight the findings consistent with hypothyroidism."),
    content: {
      columns: ["Category", "Findings"],
      rows: [
        {
          id: "r1",
          cells: [
            [t("Vital signs")],
            [s("a", "Heart rate 52"), t("; "), s("b", "temperature 35.9 °C")],
          ],
        },
        {
          id: "r2",
          cells: [
            [t("Integumentary")],
            [s("c", "Warm, moist skin"), t("; "), s("d", "coarse, thinning hair")],
          ],
        },
      ],
    },
    answerKey: { correctSpanIds: ["a", "b", "d"] },
    scoring: { model: "plus_minus", maxPoints: 3 },
  },
  cases: [
    { name: "empty", response: { type: "highlight_table", spanIds: [] }, expectedPoints: 0 },
    {
      name: "all correct",
      response: { type: "highlight_table", spanIds: ["g1", "s1", "s2", "r1"] },
      expectedPoints: 4,
    },
    {
      name: "over-selection in one row floors only that row",
      response: { type: "highlight_table", spanIds: ["g1", "g2", "s3", "r1"] },
      expectedPoints: 1,
    },
  ],
};

export const orderedResponseFixture: ItemFixture<"ordered_response"> = {
  type: "ordered_response",
  canonical: {
    id: "or_sample_1",
    type: "ordered_response",
    cjmmStep: 5,
    tags: [SAMPLE_TAG, "emergency"],
    stem: md(
      "A client on the medical unit is found unresponsive without a pulse. Place the nurse's actions in the correct order.",
    ),
    content: {
      items: [
        { id: "act_help", label: "Call for help and activate the emergency response" },
        { id: "act_cpr", label: "Begin chest compressions" },
        { id: "act_aed", label: "Apply the defibrillator pads when the device arrives" },
        { id: "act_rhythm", label: "Analyze the rhythm" },
        { id: "act_shock", label: "Deliver a shock if advised" },
      ],
    },
    answerKey: { orderedIds: ["act_help", "act_cpr", "act_aed", "act_rhythm", "act_shock"] },
    scoring: { model: "zero_one", maxPoints: 1 },
    rationale: {
      general: md(
        "Activate the response, start high-quality compressions immediately, then defibrillate as soon as the device is available.",
      ),
    },
  },
  edge: {
    id: "or_sample_partial",
    type: "ordered_response",
    tags: [SAMPLE_TAG],
    stem: md("Order the steps for administering an intramuscular injection."),
    content: {
      partial: "position",
      items: [
        { id: "s1", label: "Verify the order and client identity" },
        { id: "s2", label: "Perform hand hygiene and gather supplies" },
        { id: "s3", label: "Select and cleanse the site" },
        { id: "s4", label: "Inject and withdraw the needle" },
      ],
    },
    answerKey: { orderedIds: ["s1", "s2", "s3", "s4"] },
    scoring: { model: "zero_one", maxPoints: 4 },
  },
  cases: [
    { name: "empty", response: { type: "ordered_response", orderedIds: [] }, expectedPoints: 0 },
    {
      name: "exact order",
      response: {
        type: "ordered_response",
        orderedIds: ["act_help", "act_cpr", "act_aed", "act_rhythm", "act_shock"],
      },
      expectedPoints: 1,
    },
    {
      name: "one swap scores zero under whole-item rule",
      response: {
        type: "ordered_response",
        orderedIds: ["act_cpr", "act_help", "act_aed", "act_rhythm", "act_shock"],
      },
      expectedPoints: 0,
    },
  ],
};

export const bowtieFixture: ItemFixture<"bowtie"> = {
  type: "bowtie",
  canonical: {
    id: "bt_sample_1",
    type: "bowtie",
    tags: [SAMPLE_TAG, "cardiac"],
    stem: md(
      "A 58-year-old client reports crushing substernal chest pain radiating to the left arm for 30 minutes, diaphoresis, and nausea. Complete the diagram by dragging from the choices below to specify the condition the client is most likely experiencing, two actions the nurse should take, and two parameters the nurse should monitor.",
    ),
    content: {
      actions: [
        { id: "act_ecg", label: "Obtain a 12-lead ECG within 10 minutes" },
        { id: "act_aspirin", label: "Administer chewable aspirin as prescribed" },
        { id: "act_walk", label: "Encourage ambulation to relieve anxiety" },
        { id: "act_heat", label: "Apply a heating pad to the chest" },
        { id: "act_meal", label: "Offer a full liquid meal" },
      ],
      conditions: [
        { id: "cond_mi", label: "Acute myocardial infarction" },
        { id: "cond_gerd", label: "Gastroesophageal reflux" },
        { id: "cond_costo", label: "Costochondritis" },
        { id: "cond_panic", label: "Panic attack" },
      ],
      parameters: [
        { id: "par_troponin", label: "Serial troponin levels" },
        { id: "par_rhythm", label: "Continuous cardiac rhythm" },
        { id: "par_bowel", label: "Bowel sounds" },
        { id: "par_temp", label: "Oral temperature" },
        { id: "par_pupil", label: "Pupil size" },
      ],
    },
    answerKey: {
      actionIds: ["act_ecg", "act_aspirin"],
      conditionId: "cond_mi",
      parameterIds: ["par_troponin", "par_rhythm"],
    },
    scoring: { model: "zero_one", maxPoints: 5 },
    rationale: {
      general: md(
        "Classic ischemic pain with autonomic symptoms is treated as acute MI until proven otherwise: rapid ECG, antiplatelet therapy, and monitoring for biomarker rise and dysrhythmia.",
      ),
    },
  },
  edge: {
    id: "bt_sample_edge",
    type: "bowtie",
    tags: [SAMPLE_TAG],
    stem: md("Complete the diagram for a client with sudden severe headache and neck stiffness."),
    content: {
      actions: [
        { id: "a1", label: "Perform a neurologic assessment" },
        { id: "a2", label: "Keep the head of the bed elevated 30 degrees" },
        { id: "a3", label: "Administer an oral laxative" },
        { id: "a4", label: "Encourage coughing exercises" },
        { id: "a5", label: "Apply warm compresses to the neck" },
      ],
      conditions: [
        { id: "c1", label: "Subarachnoid hemorrhage" },
        { id: "c2", label: "Tension headache" },
        { id: "c3", label: "Sinusitis" },
        { id: "c4", label: "Cervical strain" },
      ],
      parameters: [
        { id: "p1", label: "Level of consciousness" },
        { id: "p2", label: "Blood pressure" },
        { id: "p3", label: "Bowel pattern" },
        { id: "p4", label: "Skin turgor" },
        { id: "p5", label: "Appetite" },
      ],
      labels: {
        actions: "Actions to Take",
        condition: "Potential Condition",
        parameters: "Parameters to Monitor",
      },
    },
    answerKey: { actionIds: ["a1", "a2"], conditionId: "c1", parameterIds: ["p1", "p2"] },
    scoring: { model: "zero_one", maxPoints: 5 },
  },
  cases: [
    {
      name: "empty",
      response: { type: "bowtie", actionIds: [], parameterIds: [] },
      expectedPoints: 0,
    },
    {
      name: "all correct in any order",
      response: {
        type: "bowtie",
        actionIds: ["act_aspirin", "act_ecg"],
        conditionId: "cond_mi",
        parameterIds: ["par_rhythm", "par_troponin"],
      },
      expectedPoints: 5,
    },
    {
      name: "condition wrong, one action and one parameter right",
      response: {
        type: "bowtie",
        actionIds: ["act_ecg", "act_walk"],
        conditionId: "cond_gerd",
        parameterIds: ["par_troponin", "par_bowel"],
      },
      expectedPoints: 2,
    },
  ],
};
