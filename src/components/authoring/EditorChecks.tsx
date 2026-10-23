import { Card } from "@/components/ui/Card";
import type { EditorIssue } from "@/lib/authoring/issueMessages";
import { issueMessageId } from "./issueIds";

export interface EditorChecksProps {
  /** What stops publishing, each a button that takes the author to its field. */
  problems: readonly EditorIssue[];
  /** Advice that does not stop publishing. */
  warnings: readonly { field: string; message: string }[];
  issueIdPrefix: string;
  /** Inside a case study the step's own heading is the h2 above these, so they are h3s. */
  nested: boolean;
  focusProblem: (field: string) => void;
}

const ITEM_CLASSES =
  "tap-target text-left text-sm font-medium text-accent-ink underline-offset-4 hover:underline";

/** Problems to fix and Worth a second look, under the editor's fields (EditorShell). */
export function EditorChecks({
  problems,
  warnings,
  issueIdPrefix,
  nested,
  focusProblem,
}: EditorChecksProps) {
  const Heading = nested ? "h3" : "h2";
  return (
    <>
      {problems.length > 0 ? (
        <Card padding="sm" role="region" aria-label="Problems to fix">
          <Heading className="mb-1 text-sm font-semibold text-ink-1">Problems to fix</Heading>
          <ul className="flex flex-col">
            {problems.map((issue) => (
              <li key={issue.field}>
                <button
                  type="button"
                  id={issueMessageId(issueIdPrefix, issue.field)}
                  onClick={() => focusProblem(issue.field)}
                  className={ITEM_CLASSES}
                >
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {warnings.length > 0 ? (
        <Card padding="sm" role="region" aria-label="Quality warnings">
          <Heading className="text-sm font-semibold text-ink-1">Worth a second look</Heading>
          <p className="mb-1 text-sm text-ink-2">These do not stop publishing.</p>
          <ul className="flex flex-col">
            {warnings.map((warning) => (
              <li key={warning.field}>
                <button
                  type="button"
                  onClick={() => focusProblem(warning.field)}
                  className={ITEM_CLASSES}
                >
                  {warning.message}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
