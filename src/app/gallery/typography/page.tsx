const OPTIONS = [
  "Auscultate the lungs and assess oxygen saturation",
  "Encourage the client to increase oral fluids",
  "Document the weight and reassess tomorrow",
  "Teach the client about low-sodium food choices",
];

const VITALS = [
  { label: "Heart rate", value: "118", unit: "/min", flag: "H" },
  { label: "Respiratory rate", value: "28", unit: "/min", flag: "H" },
  { label: "Blood pressure", value: "108/66", unit: "mm Hg", flag: "" },
  { label: "SpO2", value: "88", unit: "%", flag: "L" },
  { label: "Temperature", value: "37.4", unit: "°C", flag: "" },
];

export default function TypographyPage() {
  return (
    <article className="max-w-4xl">
      <p className="eyebrow">Foundations</p>
      <h1 className="mt-2 text-2xl font-semibold">Typography</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        Inter carries the interface, Source Serif carries clinical narrative, JetBrains Mono carries
        numbers. Abnormal values get a tag, never red text; red is reserved for feedback.
      </p>

      <section className="mt-10 rounded-md border border-line bg-surface-1 p-5 sm:p-6">
        <p className="eyebrow">Item stem</p>
        <p className="stem mt-3">
          A client with heart failure reports gaining 2.3 kg (5 lb) in two days and new shortness of
          breath when lying flat. Which action should the nurse take first?
        </p>
        <p className="instructions mt-2">Select one option.</p>
        <ol className="mt-5 flex flex-col gap-2">
          {OPTIONS.map((option, index) => (
            <li
              key={option}
              className="option flex items-start gap-3 rounded-sm border border-line px-4 py-3"
            >
              <span className="font-mono text-sm text-ink-2">
                {String.fromCharCode(65 + index)}
              </span>
              <span>{option}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8 rounded-md border border-line bg-surface-1 p-5 sm:p-6">
        <p className="eyebrow">Nurses&apos; notes</p>
        <p className="ehr-time mt-3">Day 1 · 1400</p>
        <p className="ehr-note mt-1">
          Client reports sudden shortness of breath and sharp right-sided chest pain that worsens
          with inspiration, onset 10 minutes ago. Appears anxious. Right calf mildly swollen and
          tender to touch compared with the left. Oxygen saturation 88% on room air; oxygen applied
          at 2 L via nasal cannula.
        </p>
      </section>

      <section className="mt-8 rounded-md border border-line bg-surface-1 p-5 sm:p-6">
        <p className="eyebrow">Vital signs</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-strong text-left text-xs tracking-wide text-ink-2 uppercase">
                <th className="py-2 pr-4 font-medium">Measure</th>
                <th className="py-2 pr-4 text-right font-medium">Value</th>
                <th className="py-2 pr-4 font-medium">Unit</th>
                <th className="py-2 font-medium">Flag</th>
              </tr>
            </thead>
            <tbody>
              {VITALS.map((row) => (
                <tr key={row.label} className="border-b border-line">
                  <td className="py-2 pr-4">{row.label}</td>
                  <td className="tabular py-2 pr-4 text-right font-mono">{row.value}</td>
                  <td className="py-2 pr-4 text-ink-2">{row.unit}</td>
                  <td className="py-2">
                    {row.flag ? (
                      <span className="rounded-sm border border-line-strong px-1.5 font-mono text-xs">
                        {row.flag}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </article>
  );
}
