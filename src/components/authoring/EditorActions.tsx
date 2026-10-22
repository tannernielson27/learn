import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

export interface EditorActionsProps {
  /** A host that only saves (a case study's step before #312): one Save, no Publish. */
  saveOnly: boolean;
  published: boolean;
  busy: boolean;
  canPublish: boolean;
  dirty: boolean;
  /** What the last save said, while the form still matches it. */
  done: string | null;
  /** Why the last save or publish failed. */
  error: string | null;
  unpublishId: string;
  onSave: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
}

/**
 * Save draft and Publish, at the top of the editor (Editor mockup): a bar that stays in view from
 * 1024px while the fields scroll, with whether anything is unsaved and what the last save said.
 */
export function EditorActions({
  saveOnly,
  published,
  busy,
  canPublish,
  dirty,
  done,
  error,
  unpublishId,
  onSave,
  onSaveDraft,
  onPublish,
}: EditorActionsProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-line bg-surface-0 pb-4 lg:sticky lg:top-0 lg:z-10 lg:col-span-2 lg:pt-3">
      <div className="flex flex-wrap items-center gap-3">
        {saveOnly ? (
          <Button type="button" variant="primary" disabled={busy} onClick={onSave}>
            Save
          </Button>
        ) : (
          <>
            <Button
              type="button"
              disabled={busy}
              aria-describedby={published ? unpublishId : undefined}
              onClick={onSaveDraft}
            >
              Save draft
            </Button>
            <Button
              type="button"
              variant="primary"
              aria-disabled={!canPublish || busy}
              onClick={onPublish}
            >
              Publish
            </Button>
          </>
        )}
        {dirty ? <p className="text-sm text-ink-2">Unsaved changes</p> : null}
        {done ? (
          <p role="status" className="text-sm text-ink-2">
            {done}
          </p>
        ) : null}
      </div>
      {error ? <Notice role="alert">{error}</Notice> : null}
      {published ? (
        <p id={unpublishId} className="text-sm text-ink-2">
          This question is published. Saving a draft takes it out of live sessions, assignments and
          practice until you publish again.
        </p>
      ) : null}
    </div>
  );
}
