import type { z } from "zod";
import type { caseStudySchema, EhrRecord } from "../schemas";
import { sampleCaseStudy } from "./case-study";

type CaseStudyInput = z.input<typeof caseStudySchema>;

/**
 * A chart that grows as the case unfolds (#334): a suspected ectopic pregnancy over one night.
 * Reveals land at steps 1, 3, 4 and 6, the labs tab is hidden, then locked, then open, and the
 * orders tab has nothing to show until step 4. Fictional, as all EHR content here is.
 */
export const stagedEhr: EhrRecord = {
  patientHeader: { age: 29, sex: "female", setting: "Emergency department" },
  timePoints: [
    { id: "tp_0100", label: "0100" },
    { id: "tp_0115", label: "0115" },
    { id: "tp_0130", label: "0130", fromStep: 3 },
    { id: "tp_0200", label: "0200", fromStep: 4 },
    { id: "tp_0400", label: "0400", fromStep: 6 },
  ],
  tabs: [
    {
      id: "staged_hp",
      kind: "history_physical",
      title: "History & Physical",
      blocks: [
        {
          kind: "markdown",
          value:
            "29-year-old woman brought in by her partner with lower abdominal pain that began four hours ago. Last menstrual period seven weeks ago. History: pelvic inflammatory disease treated two years ago. No regular medications, no known drug allergies.",
        },
      ],
    },
    {
      id: "staged_notes",
      kind: "nurses_notes",
      title: "Nurses' Notes",
      blocks: [
        {
          kind: "markdown",
          value:
            "0100: Alert and oriented. Reports cramping pain in the left lower abdomen, 6/10, with light vaginal spotting since yesterday. Skin warm and dry.",
        },
        {
          kind: "markdown",
          value:
            "0115: Pain now 8/10 and constant. Reports new pain at the tip of the left shoulder. Abdomen guarded on the left. Peripheral IV placed; blood drawn and sent.",
        },
        {
          kind: "markdown",
          fromStep: 3,
          value:
            "0130: Pale and diaphoretic. Reports feeling lightheaded when sitting up. Abdomen rigid with rebound tenderness. Provider at the bedside; bedside ultrasound performed.",
        },
        {
          kind: "markdown",
          fromStep: 4,
          value:
            "0200: Second large-bore IV placed. Isotonic fluid bolus running. Consent for surgery obtained by the provider. Client kept nothing by mouth.",
        },
        {
          kind: "markdown",
          fromStep: 6,
          value:
            "0400: Returned from the operating room after laparoscopic left salpingectomy. Drowsy, rousable to voice. Three port sites dry and intact. Pain 3/10.",
        },
      ],
    },
    {
      id: "staged_vitals",
      kind: "vital_signs",
      title: "Vital Signs",
      blocks: [
        {
          kind: "table",
          columns: ["", "0100", "0115", "0130", "0200", "0400"],
          rows: [
            ["Heart rate", "98", "112", "128", "122", "92"],
            ["Blood pressure", "112/70", "104/64", "88/52", "94/58", "110/68"],
            ["Respiratory rate", "18", "22", "26", "24", "16"],
            ["SpO2", "99% RA", "98% RA", "96% RA", "97% 2 L", "98% RA"],
          ],
        },
      ],
    },
    {
      id: "staged_labs",
      kind: "lab_results",
      title: "Lab Results",
      stepAccess: ["hidden", "locked", "open", "open", "open", "open"],
      blocks: [
        { kind: "markdown", value: "Drawn 0115, resulted 0128." },
        {
          kind: "vitals",
          rows: [
            { label: "Serum hCG", value: "2,400", unit: "mIU/mL", flag: "H" },
            { label: "Hemoglobin", value: "9.4", unit: "g/dL", flag: "L" },
            { label: "Blood type", value: "O negative" },
          ],
        },
      ],
    },
    {
      id: "staged_diagnostics",
      kind: "diagnostics",
      title: "Diagnostics",
      timePointId: "tp_0130",
      blocks: [
        {
          kind: "markdown",
          value:
            "Bedside transvaginal ultrasound: no intrauterine gestation. Left adnexal mass with free fluid in the pelvis, consistent with a ruptured ectopic pregnancy.",
        },
      ],
    },
    {
      id: "staged_orders",
      kind: "orders",
      title: "Orders",
      blocks: [
        {
          kind: "markdown",
          fromStep: 4,
          value:
            "- Lactated Ringer's 1,000 mL bolus\n- Type and crossmatch 2 units\n- Nothing by mouth\n- Prepare for emergency laparoscopy",
        },
        {
          kind: "markdown",
          fromStep: 6,
          value: "- Rh immune globulin 300 mcg IM before discharge\n- Vital signs every 15 minutes",
        },
      ],
    },
  ],
};

/** The sample case study's six steps beside the staged chart, for import and export tests. */
export const stagedCaseStudy: CaseStudyInput = {
  ...sampleCaseStudy,
  id: "cs_sample_staged_chart",
  title: "A chart that grows with the case",
  ehr: stagedEhr,
};
