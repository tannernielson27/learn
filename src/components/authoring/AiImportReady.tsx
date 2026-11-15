import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { AiImportFileRows, type FileRow } from "./AiImportFileRows";

export interface AiImportReadyProps {
  /** For the heading's id. */
  id: string;
  bankId: string;
  batchId: string | null;
  rows: readonly FileRow[];
  /** Questions found across the files. */
  questions: number;
}

/**
 * The upload page once every file has been read (#345): the files, the count and the way on. The
 * way back to the quiz is the page's breadcrumb, which names it once (#563).
 */
export function AiImportReady({ id, bankId, batchId, rows, questions }: AiImportReadyProps) {
  return (
    <section aria-labelledby={`${id}-review`} className="flex flex-col gap-4 sm:max-w-2xl">
      <AiImportFileRows rows={rows} busy={false} />
      <h2 id={`${id}-review`} className="font-read text-2xl text-ink-1">
        Ready for review
      </h2>
      <p role="status" className="text-ink-1">
        {questions} {questions === 1 ? "question is" : "questions are"} waiting for review.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        {batchId ? (
          <Link
            href={`/author/banks/${bankId}/ai-import/${batchId}`}
            className={buttonClasses({ variant: "primary" })}
          >
            Review the questions
          </Link>
        ) : null}
      </div>
    </section>
  );
}
