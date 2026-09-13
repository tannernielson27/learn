// The parts every editor shares, pulled out of MultipleChoiceEditor so each new type only
// supplies its fields: the live preview, Problems to fix, Save draft and Publish, and
// unsaved-change tracking against the last saved snapshot.
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import { Button } from "@/components/ui/Button";
import type { EditorIssue } from "@/lib/authoring/issueMessages";
import { scoringSummary } from "@/lib/authoring/scoringSummary";
import type { Item } from "@/lib/ngn/schemas";
import type { ScoringModel } from "@/lib/ngn/types";

export interface SaveResult {
  ok: boolean;
  error?: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

/** Every editor's item input carries the scoring its form derives. */
export interface ScoredInput {
  scoring?: { model: ScoringModel; maxPoints: number };
}

export interface EditorShellProps<Values, Input extends ScoredInput> {
  /** The form as it stands right now (re-read on every render by the caller). */
  values: Values;
  initialValues: Values;
  /** Item input built from the values; previewed as-is and published only when valid. */
  input: Input;
  valid: boolean;
  issues: readonly EditorIssue[];
  /** Id prefix for problem messages, so fields can point at them with aria-describedby. */
  issueIdPrefix: string;
  focusField: (field: string) => void;
  /** Reads the latest values at the moment Save or Publish is pressed. */
  readValues: () => Values;
  toInput: (values: Values) => Input;
  onSaveDraft: (values: Values) => Promise<SaveResult>;
  onPublish: (input: Input) => Promise<SaveResult>;
  /** The type's own fields. */
  children: ReactNode;
}

export function issueMessageId(prefix: string, field: string): string {
  return `${prefix}-issue-${field.replace(/\./g, "-")}`;
}

export function EditorShell<Values, Input extends ScoredInput>({
  values,
  initialValues,
  input,
  valid,
  issues,
  issueIdPrefix,
  focusField,
  readValues,
  toInput,
  onSaveDraft,
  onPublish,
  children,
}: EditorShellProps<Values, Input>) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Compared rather than reset, so text typed while a save is in flight is kept and stays unsaved.
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initialValues));
  const isDirty = JSON.stringify(values) !== savedSnapshot;
  const busy = status.kind === "busy";
  // Only a valid item has a final maximum; scoringSummary says so instead of guessing.
  const scoring = scoringSummary(input.scoring, valid);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  async function run(
    action: (current: Values) => Promise<SaveResult>,
    doneMessage: string,
    failMessage: string,
  ) {
    setStatus({ kind: "busy" });
    const current = readValues();
    let result: SaveResult;
    try {
      result = await action(current);
    } catch {
      // A request that fails outright (a dropped connection) rejects instead of returning a
      // result; without this the editor would stay busy with both buttons disabled.
      setStatus({ kind: "error", message: failMessage });
      return;
    }
    if (result.ok) {
      setSavedSnapshot(JSON.stringify(current));
      setStatus({ kind: "done", message: doneMessage });
    } else {
      setStatus({ kind: "error", message: result.error ?? failMessage });
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form className="flex flex-col gap-6" onSubmit={(event) => event.preventDefault()} noValidate>
        {/* Not a live region: it changes with every answer marked, and would repeat itself. */}
        <section
          aria-label="Scoring"
          className="rounded-sm border border-line bg-surface-1 px-4 py-3"
        >
          <p className="text-sm font-medium text-ink-1">{scoring.headline}</p>
          {scoring.rule ? <p className="mt-1 text-sm text-ink-2">{scoring.rule}</p> : null}
        </section>

        {children}

        {issues.length > 0 ? (
          <section
            aria-label="Problems to fix"
            className="rounded-sm border border-line bg-surface-1 p-4"
          >
            <h2 className="mb-2 text-sm font-medium text-ink-1">
              Before this item can be published
            </h2>
            <ul className="flex flex-col gap-1">
              {issues.map((issue) => (
                <li key={issue.field}>
                  <button
                    type="button"
                    id={issueMessageId(issueIdPrefix, issue.field)}
                    onClick={() => focusField(issue.field)}
                    className="tap-target text-left text-sm text-accent-ink underline-offset-4 hover:underline"
                  >
                    {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              run(onSaveDraft, "Draft saved.", "The draft could not be saved. Try again.")
            }
          >
            Save draft
          </Button>
          <Button
            type="button"
            variant="primary"
            aria-disabled={!valid || busy}
            onClick={() => {
              if (!valid || busy) return;
              void run(
                (current) => onPublish(toInput(current)),
                "Published.",
                "The item could not be published. Try again.",
              );
            }}
          >
            Publish
          </Button>
          {isDirty ? <p className="text-sm text-ink-2">Unsaved changes</p> : null}
          {status.kind === "done" ? (
            <p role="status" className="text-sm text-ink-2">
              {status.message}
            </p>
          ) : null}
          {status.kind === "error" ? (
            <p role="alert" className="text-sm text-incorrect">
              {status.message}
            </p>
          ) : null}
        </div>
      </form>

      <section aria-label="Preview" className="lg:sticky lg:top-4 lg:self-start">
        <p className="eyebrow mb-2">Preview</p>
        {/* The transform makes this box the containing block for the player's fixed submit bar. */}
        <div
          className="rounded-sm border border-line bg-surface-0 p-4 pb-24"
          style={{ transform: "translateZ(0)" }}
        >
          {/* The same player students use, unkeyed so it updates in place. */}
          <ItemPlayer item={input as unknown as Item} />
        </div>
      </section>
    </div>
  );
}
