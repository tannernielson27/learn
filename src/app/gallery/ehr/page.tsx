import { EhrPanelDemo } from "./demo";

export default function EhrPanelPage() {
  return (
    <article className="max-w-5xl">
      <p className="eyebrow">Foundations</p>
      <h1 className="mt-2 text-2xl font-semibold">EHR panel</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        The patient record a case study is read from: a patient header, one tab per charted section,
        and blocks of notes, tables and flagged values. Tabs open by id, so an item can point the
        reader at the chart it needs. Sample content is fictional.
      </p>
      <EhrPanelDemo />
    </article>
  );
}
