import type { EhrRecord, ItemInputOf } from "../schemas";
import { SAMPLE_TAG, md } from "./types";

/**
 * A record charted three times over one shift. Sections repeat at each time; labs were not drawn
 * at 0800, so that section is simply absent then. Fictional, as all EHR content here is.
 */
export const sampleTrendEhr: EhrRecord = {
  patientHeader: { age: 68, sex: "male", setting: "Medical unit", admissionDate: "Day 2" },
  timePoints: [
    { id: "tp_0800", label: "0800" },
    { id: "tp_1200", label: "1200" },
    { id: "tp_1600", label: "1600" },
  ],
  tabs: [
    {
      id: "trend_hp",
      kind: "history_physical",
      title: "History & Physical",
      blocks: [
        {
          kind: "markdown",
          value:
            "68-year-old man admitted two days ago with community-acquired pneumonia of the right lower lobe. History: type 2 diabetes, 40 pack-year smoking history, no known drug allergies. Started on intravenous ceftriaxone and azithromycin on admission.",
        },
      ],
    },
    {
      id: "trend_notes_0800",
      kind: "nurses_notes",
      title: "Nurses' Notes",
      timePointId: "tp_0800",
      blocks: [
        {
          kind: "markdown",
          value:
            "0800: Alert and oriented to person, place and time. Productive cough with thick yellow sputum. Tolerating a full liquid diet. Ambulated to the bathroom with one assist. Voided 250 mL of clear yellow urine overnight.",
        },
      ],
    },
    {
      id: "trend_notes_1200",
      kind: "nurses_notes",
      title: "Nurses' Notes",
      timePointId: "tp_1200",
      blocks: [
        {
          kind: "markdown",
          value:
            "1200: Oriented to person and place, slow to answer questions. Reports feeling cold; skin warm and flushed. Declined lunch. Has not voided since 0800. Cough now weak and non-productive.",
        },
      ],
    },
    {
      id: "trend_notes_1600",
      kind: "nurses_notes",
      title: "Nurses' Notes",
      timePointId: "tp_1600",
      blocks: [
        {
          kind: "markdown",
          value:
            "1600: Oriented to person only; drowsy, rousable to voice. Skin mottled at the knees. Capillary refill four seconds. No urine output this shift. Requires two assists to reposition.",
        },
      ],
    },
    {
      id: "trend_vitals_0800",
      kind: "vital_signs",
      title: "Vital Signs",
      timePointId: "tp_0800",
      blocks: [
        {
          kind: "vitals",
          rows: [
            { label: "Temperature", value: "38.1", unit: "°C", flag: "H" },
            { label: "Heart rate", value: "96", unit: "beats/min" },
            { label: "Respiratory rate", value: "20", unit: "breaths/min" },
            { label: "Blood pressure", value: "126/74", unit: "mm Hg" },
            { label: "SpO2", value: "94", unit: "% on room air" },
          ],
        },
      ],
    },
    {
      id: "trend_vitals_1200",
      kind: "vital_signs",
      title: "Vital Signs",
      timePointId: "tp_1200",
      blocks: [
        {
          kind: "vitals",
          rows: [
            { label: "Temperature", value: "39.0", unit: "°C", flag: "H" },
            { label: "Heart rate", value: "118", unit: "beats/min", flag: "H" },
            { label: "Respiratory rate", value: "26", unit: "breaths/min", flag: "H" },
            { label: "Blood pressure", value: "104/58", unit: "mm Hg", flag: "L" },
            { label: "SpO2", value: "91", unit: "% on 2 L nasal cannula" },
          ],
        },
      ],
    },
    {
      id: "trend_vitals_1600",
      kind: "vital_signs",
      title: "Vital Signs",
      timePointId: "tp_1600",
      blocks: [
        {
          kind: "vitals",
          rows: [
            { label: "Temperature", value: "38.6", unit: "°C", flag: "H" },
            { label: "Heart rate", value: "132", unit: "beats/min", flag: "H" },
            { label: "Respiratory rate", value: "32", unit: "breaths/min", flag: "H" },
            { label: "Blood pressure", value: "86/44", unit: "mm Hg", flag: "L" },
            { label: "SpO2", value: "89", unit: "% on 6 L face mask", flag: "L" },
          ],
        },
      ],
    },
    {
      id: "trend_labs_1200",
      kind: "lab_results",
      title: "Lab Results",
      timePointId: "tp_1200",
      blocks: [
        {
          kind: "vitals",
          rows: [
            { label: "White blood cells", value: "18.4", unit: "K/µL", flag: "H" },
            { label: "Lactate", value: "2.6", unit: "mmol/L", flag: "H" },
            { label: "Creatinine", value: "1.4", unit: "mg/dL", flag: "H" },
            { label: "Glucose", value: "188", unit: "mg/dL", flag: "H" },
          ],
        },
      ],
    },
    {
      id: "trend_labs_1600",
      kind: "lab_results",
      title: "Lab Results",
      timePointId: "tp_1600",
      blocks: [
        {
          kind: "vitals",
          rows: [
            { label: "White blood cells", value: "21.2", unit: "K/µL", flag: "H" },
            { label: "Lactate", value: "4.1", unit: "mmol/L", flag: "H" },
            { label: "Creatinine", value: "2.0", unit: "mg/dL", flag: "H" },
            { label: "Glucose", value: "214", unit: "mg/dL", flag: "H" },
          ],
        },
      ],
    },
    {
      id: "trend_orders",
      kind: "orders",
      title: "Orders",
      blocks: [
        {
          kind: "markdown",
          value:
            "- Ceftriaxone 1 g intravenously every 24 h\n- Azithromycin 500 mg intravenously every 24 h\n- Oxygen to keep saturation above 92%\n- Vital signs every 4 h\n- Strict intake and output",
        },
      ],
    },
  ],
};

/**
 * The canonical Trend item: one record read at three times, asking what each finding has done
 * across them. Evaluate Outcomes, the step Trend items usually sit at.
 */
export const sampleTrendItem: ItemInputOf<"matrix_multiple_choice"> = {
  id: "trend_sample_cap_sepsis",
  type: "matrix_multiple_choice",
  cjmmStep: 6,
  tags: [SAMPLE_TAG, "respiratory", "sepsis"],
  stem: md(
    "The nurse reviews the record at 0800, 1200 and 1600. For each finding, indicate whether it has improved, is unchanged, or has declined over the shift.",
  ),
  instructions: "Choose one option in each row.",
  ehr: sampleTrendEhr,
  content: {
    rows: [
      { id: "r_perfusion", label: "Peripheral perfusion" },
      { id: "r_bp", label: "Blood pressure" },
      { id: "r_oxygen", label: "Oxygenation" },
      { id: "r_temp", label: "Temperature" },
    ],
    columns: [
      { id: "c_improved", label: "Improved" },
      { id: "c_unchanged", label: "Unchanged" },
      { id: "c_declined", label: "Declined" },
    ],
  },
  answerKey: {
    rows: [
      { rowId: "r_perfusion", correctColumnId: "c_declined" },
      { rowId: "r_bp", correctColumnId: "c_declined" },
      { rowId: "r_oxygen", correctColumnId: "c_declined" },
      { rowId: "r_temp", correctColumnId: "c_improved" },
    ],
  },
  scoring: { model: "zero_one", maxPoints: 4 },
  rationale: {
    general: md(
      "Mottled skin, a four-second capillary refill and no urine output mark worsening perfusion, and the blood pressure has fallen while the heart rate has climbed. Oxygenation has declined despite rising support, from 94% on room air to 89% on a face mask. The temperature alone has come down, which alongside every other finding is not reassurance.",
    ),
  },
};
