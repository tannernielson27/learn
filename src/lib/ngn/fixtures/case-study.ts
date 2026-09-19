import type { z } from "zod";
import type { caseStudySchema, EhrRecord } from "../schemas";
import { SAMPLE_TAG, md } from "./types";

type CaseStudyInput = z.input<typeof caseStudySchema>;

const t = (value: string) => ({ kind: "text" as const, value });
const s = (spanId: string, value: string) => ({ kind: "span" as const, spanId, value });
const blank = (blankId: string) => ({ kind: "blank" as const, blankId });

export const sampleEhr: EhrRecord = {
  patientHeader: { age: 74, sex: "female", setting: "Orthopedic unit", admissionDate: "Day 0" },
  timePoints: [
    { id: "tp_0800", label: "Day 1, 0800" },
    { id: "tp_1400", label: "Day 1, 1400" },
  ],
  tabs: [
    {
      id: "tab_hp",
      kind: "history_physical",
      title: "History & Physical",
      blocks: [
        {
          kind: "markdown",
          value:
            "74-year-old woman, post-operative day 1 following elective right total hip arthroplasty. History: hypertension, obesity (BMI 34), no anticoagulant use before admission. Surgery uncomplicated; spinal anesthesia. Enoxaparin prescribed to begin this morning.",
        },
      ],
    },
    {
      id: "tab_notes_0800",
      kind: "nurses_notes",
      title: "Nurses' Notes",
      timePointId: "tp_0800",
      blocks: [
        {
          kind: "markdown",
          value:
            "0800: Alert and oriented. Reports incisional pain 4/10, controlled with oral oxycodone. Dressing dry and intact. Has not yet been out of bed; declined physical therapy yesterday evening due to nausea. Sequential compression devices in place on left leg only; right removed for dressing check and not reapplied.",
        },
      ],
    },
    {
      id: "tab_notes_1400",
      kind: "nurses_notes",
      title: "Nurses' Notes",
      timePointId: "tp_1400",
      blocks: [
        {
          kind: "markdown",
          value:
            "1400: Client reports sudden shortness of breath and sharp right-sided chest pain that worsens with inspiration, onset 10 minutes ago. Alert and oriented. Right calf mildly swollen and tender to touch compared with the left. Oxygen saturation 88% on room air; oxygen applied at 2 L via nasal cannula.",
        },
      ],
    },
    {
      id: "tab_vitals",
      kind: "vital_signs",
      title: "Vital Signs",
      blocks: [
        {
          kind: "table",
          columns: ["", "Day 1, 0800", "Day 1, 1400"],
          rows: [
            ["Temperature", "37.1 °C", "37.4 °C"],
            ["Heart rate", "82", "118"],
            ["Respiratory rate", "16", "28"],
            ["Blood pressure", "134/82", "108/66"],
            ["SpO2", "96% RA", "88% RA / 92% 2 L"],
            ["Pain", "4/10 incisional", "7/10 pleuritic"],
          ],
        },
      ],
    },
    {
      id: "tab_labs",
      kind: "lab_results",
      title: "Lab Results",
      timePointId: "tp_1400",
      blocks: [
        { kind: "markdown", value: "Drawn 1410, resulted 1450." },
        {
          kind: "vitals",
          rows: [
            { label: "Hemoglobin", value: "10.2", unit: "g/dL", flag: "L" },
            { label: "Platelets", value: "212", unit: "K/µL" },
            { label: "INR", value: "1.1" },
            { label: "D-dimer", value: "3.8", unit: "µg/mL FEU", flag: "H" },
            { label: "Troponin I", value: "0.02", unit: "ng/mL" },
          ],
        },
      ],
    },
    {
      id: "tab_orders",
      kind: "orders",
      title: "Orders",
      blocks: [
        {
          kind: "markdown",
          value:
            "- Enoxaparin 40 mg subcutaneous daily (first dose due 0900, not yet documented as given)\n- Oxycodone 5 mg PO every 4 h PRN pain\n- Physical therapy twice daily, weight bearing as tolerated\n- Sequential compression devices bilaterally while in bed",
        },
      ],
    },
  ],
};

export const sampleCaseStudy: CaseStudyInput = {
  id: "cs_sample_hip_pe",
  title: "Post-operative day 1: sudden dyspnea after hip arthroplasty",
  tags: [SAMPLE_TAG, "perioperative", "respiratory"],
  ehr: sampleEhr,
  items: [
    {
      id: "cs_hip_1",
      type: "highlight_text",
      cjmmStep: 1,
      tags: [SAMPLE_TAG],
      stem: md(
        "Click to highlight the findings in the 1400 nurses' note that require immediate follow-up.",
      ),
      content: {
        passage: [
          t("1400: Client reports "),
          s("sp_sob", "sudden shortness of breath"),
          t(" and "),
          s("sp_pain", "sharp right-sided chest pain that worsens with inspiration"),
          t(", "),
          s("sp_onset", "onset 10 minutes ago"),
          t(". "),
          s("sp_alert", "Alert and oriented"),
          t(". "),
          s("sp_calf", "Right calf mildly swollen and tender"),
          t(" compared with the left. "),
          s("sp_sat", "Oxygen saturation 88% on room air"),
          t("; "),
          s("sp_o2", "oxygen applied at 2 L via nasal cannula"),
          t("."),
        ],
      },
      answerKey: { correctSpanIds: ["sp_sob", "sp_pain", "sp_calf", "sp_sat"] },
      scoring: { model: "plus_minus", maxPoints: 4 },
      rationale: {
        general: md(
          "Acute dyspnea, pleuritic pain, hypoxemia, and a unilateral swollen calf together point to a venous thromboembolic event.",
        ),
      },
    },
    {
      id: "cs_hip_2",
      type: "matrix_multiple_response",
      cjmmStep: 2,
      tags: [SAMPLE_TAG],
      stem: md("For each finding, select every condition it is consistent with."),
      content: {
        rows: [
          { id: "r_pain", label: "Pleuritic chest pain" },
          { id: "r_calf", label: "Unilateral calf swelling" },
          { id: "r_ddimer", label: "D-dimer 3.8 µg/mL FEU" },
        ],
        columns: [
          { id: "c_pe", label: "Pulmonary embolism" },
          { id: "c_mi", label: "Myocardial infarction" },
          { id: "c_pna", label: "Pneumonia" },
        ],
      },
      answerKey: {
        rows: [
          { rowId: "r_pain", correctColumnIds: ["c_pe", "c_pna"] },
          { rowId: "r_calf", correctColumnIds: ["c_pe"] },
          { rowId: "r_ddimer", correctColumnIds: ["c_pe"] },
        ],
      },
      scoring: { model: "plus_minus", maxPoints: 4 },
      rationale: {
        general: md(
          "Pleuritic pain occurs with PE and pneumonia, and unilateral calf swelling points toward a clot. An elevated D-dimer is nonspecific and rises after any surgery; it supports PE only alongside the calf and respiratory findings.",
        ),
      },
    },
    {
      id: "cs_hip_3",
      type: "dropdown_rationale",
      cjmmStep: 3,
      tags: [SAMPLE_TAG],
      stem: md("Complete the following sentence by choosing from the lists of options."),
      content: {
        tokens: [
          t("The client is most likely experiencing "),
          blank("cond"),
          t(" as evidenced by "),
          blank("ev1"),
          t(" and "),
          blank("ev2"),
          t("."),
        ],
        blanks: [
          {
            id: "cond",
            choices: [
              { id: "cond_pe", label: "a pulmonary embolism" },
              { id: "cond_mi", label: "a myocardial infarction" },
              { id: "cond_atel", label: "atelectasis" },
            ],
          },
          {
            id: "ev1",
            choices: [
              { id: "ev1_hypox", label: "acute hypoxemia with tachypnea" },
              { id: "ev1_trop", label: "an elevated troponin" },
              { id: "ev1_fever", label: "a high fever" },
            ],
          },
          {
            id: "ev2",
            choices: [
              { id: "ev2_calf", label: "unilateral calf swelling" },
              { id: "ev2_inr", label: "an INR of 1.1" },
              { id: "ev2_hgb", label: "a hemoglobin of 10.2 g/dL" },
            ],
          },
        ],
      },
      answerKey: {
        anchorBlankId: "cond",
        blanks: [
          { blankId: "cond", correctChoiceId: "cond_pe" },
          { blankId: "ev1", correctChoiceId: "ev1_hypox" },
          { blankId: "ev2", correctChoiceId: "ev2_calf" },
        ],
      },
      scoring: { model: "rationale", maxPoints: 2 },
      rationale: {
        general: md(
          "Pleuritic pain, hypoxemia and a swollen calf on the operative side, after immobility and a missed dose of prophylaxis, make PE most likely. A single normal troponin does not exclude MI, but the pain pattern does not fit it.",
        ),
      },
    },
    {
      id: "cs_hip_4",
      type: "multiple_response",
      cjmmStep: 4,
      tags: [SAMPLE_TAG],
      stem: md("Which interventions should the nurse anticipate for this client?"),
      instructions: "Select all that apply.",
      content: {
        variant: "sata",
        options: [
          { id: "o_o2", label: "Titrate oxygen to maintain saturation above 92%" },
          { id: "o_ct", label: "Prepare for CT pulmonary angiography" },
          { id: "o_antico", label: "Anticipate therapeutic anticoagulation" },
          { id: "o_massage", label: "Massage the right calf to relieve tenderness" },
          { id: "o_ambulate", label: "Assist the client to ambulate in the hall" },
          { id: "o_hob", label: "Raise the head of the bed" },
        ],
      },
      answerKey: { correctOptionIds: ["o_o2", "o_ct", "o_antico", "o_hob"] },
      scoring: { model: "plus_minus", maxPoints: 4 },
      rationale: {
        general: md(
          "Support oxygenation, confirm the diagnosis, and anticipate anticoagulation. Raising the head of the bed eases the work of breathing. Massage and ambulation risk dislodging thrombus.",
        ),
        perElement: {
          o_o2: md("Hypoxemia is the immediate threat; titrated oxygen supports gas exchange."),
          o_ct: md("CT pulmonary angiography confirms a suspected pulmonary embolism."),
          o_antico: md(
            "Anticoagulation stops the clot from growing while the body breaks it down.",
          ),
          o_massage: md("Massaging a calf with a suspected clot can dislodge it."),
          o_ambulate: md(
            "Walking raises oxygen demand and can dislodge a clot; keep the client in bed.",
          ),
          o_hob: md("Sitting upright eases the work of breathing."),
        },
      },
    },
    {
      id: "cs_hip_5",
      type: "ordered_response",
      cjmmStep: 5,
      tags: [SAMPLE_TAG],
      stem: md("Place the nurse's immediate actions in priority order."),
      content: {
        items: [
          {
            id: "a_o2",
            label: "Elevate the head of the bed and increase supplemental oxygen",
          },
          { id: "a_notify", label: "Notify the provider using SBAR" },
          { id: "a_iv", label: "Confirm patent IV access" },
          { id: "a_doc", label: "Document the event" },
        ],
      },
      answerKey: { orderedIds: ["a_o2", "a_notify", "a_iv", "a_doc"] },
      scoring: { model: "zero_one", maxPoints: 1 },
      rationale: {
        general: md(
          "Stabilize oxygenation and positioning first, escalate immediately, prepare for treatment, then document.",
        ),
      },
    },
    {
      id: "cs_hip_6",
      type: "matrix_multiple_choice",
      cjmmStep: 6,
      tags: [SAMPLE_TAG],
      stem: md(
        "Two hours after anticoagulation began, the nurse reassesses the client. For each finding, indicate whether it shows the client is improving or not improving.",
      ),
      content: {
        rows: [
          { id: "f_sat", label: "SpO2 95% on 2 L nasal cannula" },
          { id: "f_rr", label: "Respiratory rate 20 breaths/min" },
          { id: "f_hr", label: "Heart rate 124 beats/min" },
          { id: "f_pain", label: "Chest pain 8/10 with inspiration" },
        ],
        columns: [
          { id: "improving", label: "Improving" },
          { id: "not_improving", label: "Not improving" },
        ],
      },
      answerKey: {
        rows: [
          { rowId: "f_sat", correctColumnId: "improving" },
          { rowId: "f_rr", correctColumnId: "improving" },
          { rowId: "f_hr", correctColumnId: "not_improving" },
          { rowId: "f_pain", correctColumnId: "not_improving" },
        ],
      },
      scoring: { model: "zero_one", maxPoints: 4 },
      rationale: {
        general: md(
          "Oxygenation and respiratory rate have improved; persistent tachycardia and pleuritic pain show the response is incomplete.",
        ),
      },
    },
  ],
};
