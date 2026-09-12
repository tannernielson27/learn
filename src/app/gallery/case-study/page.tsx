import { sampleCaseStudy } from "@/lib/ngn/fixtures";
import { caseStudySchema } from "@/lib/ngn/schemas";
import { caseStudyMaxPoints } from "@/lib/ngn/scoring";
import { CaseStudyDemo } from "./demo";

// Parsed on the server, so the browser bundle carries neither the fixtures module nor zod.
const sample = caseStudySchema.parse(sampleCaseStudy);

export default function CaseStudyPage() {
  return (
    <article className="max-w-5xl">
      <p className="eyebrow">Composites</p>
      <h1 className="mt-2 text-2xl font-semibold">Case study</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        Six items, one per clinical judgment step, with the patient&rsquo;s record beside them
        throughout. Each step is an ordinary item player, so every format works here unchanged.
        Sample content is fictional: {sampleCaseStudy.title}.
      </p>
      <CaseStudyDemo caseStudy={sample} maxPoints={caseStudyMaxPoints(sample)} />
    </article>
  );
}
