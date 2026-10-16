import type { ReviewEntryView } from "@/lib/authoring/aiImportReview";
import { AiImportReviewDemo } from "./demo";

/**
 * The AI import review screen (#346) with three staged questions, none of them keyed, for the
 * teacher guide's figure (#349): a committed baseline of it is copied to `public/help`. Nothing
 * here shows an answer, so the figure gives no key away (#269, decision 6). Content is fictional.
 */
const ENTRIES: ReviewEntryView[] = [
  {
    id: "00000000-0000-4000-8000-0000000000e1",
    version: 1,
    position: 0,
    kind: "item",
    type: "multiple_choice",
    status: "needs_answer",
    reasons: [
      {
        code: "needs_answer",
        message: "The source marks no answer. Add the key before this question can be imported.",
      },
    ],
    sourceExcerpt:
      "A client with type 1 diabetes is found sweating and shaky. The capillary blood glucose is 52 mg/dL, and the client is awake and able to swallow. What should the nurse give first?",
    item: {
      id: "ai_gallery_q1",
      type: "multiple_choice",
      stem: {
        kind: "markdown",
        value:
          "A client with type 1 diabetes is found sweating and shaky. The capillary blood glucose is 52 mg/dL, and the client is awake and able to swallow. What should the nurse give first?",
      },
      content: {
        options: [
          { id: "opt_a", label: "4 ounces of fruit juice" },
          { id: "opt_b", label: "A glass of whole milk with crackers" },
          { id: "opt_c", label: "Glucagon 1 mg intramuscularly" },
          { id: "opt_d", label: "Regular insulin as prescribed" },
        ],
      },
      answerKey: { correctOptionId: "" },
      scoring: { model: "zero_one", maxPoints: 1 },
      rationale: {},
    },
    group: null,
  },
  {
    id: "00000000-0000-4000-8000-0000000000e2",
    version: 1,
    position: 1,
    kind: "item",
    type: "multiple_response",
    status: "needs_fix",
    reasons: [
      {
        code: "unmarked_key",
        message:
          "The AI marked an answer this part of the document does not show, so the question was not converted. Check the key against the document.",
      },
    ],
    sourceExcerpt:
      "The nurse is caring for a client who is receiving a continuous heparin infusion. Which findings should the nurse report to the health care provider? Select all that apply.",
    item: null,
    group: null,
  },
  {
    id: "00000000-0000-4000-8000-0000000000e3",
    version: 1,
    position: 2,
    kind: "item",
    type: null,
    status: "not_importable",
    reasons: [{ code: "not_ngn", message: "An open discussion prompt, with nothing to score." }],
    sourceExcerpt:
      "In small groups, describe how you would explain the purpose of an incentive spirometer to a client who is anxious about pain after surgery.",
    item: null,
    group: null,
  },
];

export default function AiImportGalleryPage() {
  return (
    <article className="max-w-5xl">
      <p className="eyebrow">Composites</p>
      <h1 className="mt-2 text-2xl font-semibold">AI import review</h1>
      <p className="mt-2 max-w-prose text-ink-2">
        What a teacher sees after Claude has read a document: each question it found, what to check,
        and the import held back until nothing needs an answer or a fix. Sample content is
        fictional, and no question here has a key.
      </p>
      <AiImportReviewDemo entries={ENTRIES} />
    </article>
  );
}
