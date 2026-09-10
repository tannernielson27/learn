"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tabs } from "@/components/ui/Tabs";

const COLUMNS = [
  { value: "indicated", label: "Indicated" },
  { value: "contraindicated", label: "Contraindicated" },
  { value: "non_essential", label: "Non-essential" },
] as const;

const RECORD_TABS = [
  {
    id: "hp",
    label: "History & Physical",
    content: (
      <p className="ehr-note">
        74-year-old woman, post-operative day 1 following elective right total hip arthroplasty.
      </p>
    ),
  },
  {
    id: "notes",
    label: "Nurses’ Notes",
    content: <p className="ehr-note">Alert and oriented. Reports incisional pain 4/10.</p>,
  },
  {
    id: "vitals",
    label: "Vital Signs",
    content: <p className="font-mono text-sm">HR 82 · RR 16 · BP 134/82 · SpO2 96%</p>,
  },
  {
    id: "labs",
    label: "Lab Results",
    content: <p className="font-mono text-sm">Hgb 10.2 L · Plt 212 · INR 1.1</p>,
  },
  {
    id: "orders",
    label: "Orders",
    content: <p className="text-sm">Enoxaparin 40 mg subcutaneous daily.</p>,
  },
];

export function PrimitivesDemo() {
  const [column, setColumn] = useState<(typeof COLUMNS)[number]["value"]>("indicated");
  return (
    <>
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Segmented control</h2>
        <p className="mt-1 text-sm text-ink-2">
          Arrow keys move the selection. On phones, matrix rows become one of these.
        </p>
        <div className="mt-3">
          <SegmentedControl
            label="Matrix row"
            options={COLUMNS}
            value={column}
            onChange={setColumn}
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Tabs</h2>
        <p className="mt-1 text-sm text-ink-2">
          The patient record tab strip. Scrolls horizontally when narrow.
        </p>
        <div className="mt-3 rounded-md border border-line bg-surface-1 p-4">
          <Tabs label="Patient record" tabs={RECORD_TABS} />
        </div>
      </section>
    </>
  );
}
