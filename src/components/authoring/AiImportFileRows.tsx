import { Button } from "@/components/ui/Button";
import { FieldError } from "./FieldError";

/** One file on the AI import page, as the page tracks it (#345). */
export interface FileRow {
  /** The file's id, or a local key for a file the server never registered. */
  key: string;
  fileId: string | null;
  name: string;
  /** What is happening to it, in words. */
  stage: string;
  /** From 0 to 1. */
  progress: number;
  tone: "working" | "done" | "refused";
  /** Offered while the import is still taking files. */
  removable: boolean;
}

export interface AiImportFileRowsProps {
  rows: readonly FileRow[];
  onRemove?: (row: FileRow) => void;
  busy: boolean;
}

/**
 * The files of an AI import and how far each has got. The bar moves by `transform` only and not
 * at all under reduced motion; the words beside it carry the same news for a screen reader.
 */
export function AiImportFileRows({ rows, onRemove, busy }: AiImportFileRowsProps) {
  if (rows.length === 0) return null;
  return (
    <ul aria-label="Files" className="flex flex-col divide-y divide-line border-y border-line">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-2 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="min-w-0 font-medium break-words text-ink-1">{row.name}</span>
            {row.removable && onRemove ? (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => onRemove(row)}
                aria-label={`Remove ${row.name}`}
              >
                Remove
              </Button>
            ) : null}
          </div>
          {/* A refused file is a system message: ink with an alert icon, never feedback red. */}
          {row.tone === "refused" ? (
            <FieldError>{row.stage}</FieldError>
          ) : (
            <p className="text-sm text-ink-2">{row.stage}</p>
          )}
          {row.tone === "refused" ? null : (
            <div
              role="progressbar"
              aria-label={`${row.name} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(row.progress * 100)}
              className="h-1.5 overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className="h-full origin-left bg-accent transition-transform duration-200 ease-out motion-reduce:transition-none"
                style={{ transform: `scaleX(${Math.max(0, Math.min(1, row.progress))})` }}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
