"use client";

import { useState, type DragEvent, type RefObject } from "react";
import { TextLink } from "@/components/ui/TextLink";
import { AI_IMPORT_ACCEPT, AI_IMPORT_MAX_FILES } from "@/lib/authoring/aiImportUpload";

export interface AiImportDropZoneProps {
  /** The file input the upload form reads when it is sent. */
  inputRef: RefObject<HTMLInputElement | null>;
  /** The input's id, for its label. */
  id: string;
  busy: boolean;
}

/**
 * Where documents are chosen or dropped for AI import (#345). A drop puts the files in the input,
 * so choosing and dropping reach the form the same way. The edge turns accent while a file is over
 * it; colour only, and the border never changes width, so nothing moves.
 */
export function AiImportDropZone({ inputRef, id, busy }: AiImportDropZoneProps) {
  const [dragging, setDragging] = useState(false);

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (inputRef.current && event.dataTransfer.files.length > 0) {
      inputRef.current.files = event.dataTransfer.files;
    }
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
      className={`flex flex-col gap-2 rounded-md border border-dashed p-4 ${dragging ? "border-accent bg-accent-soft" : "border-line-field bg-surface-1"}`}
    >
      <label htmlFor={id} className="text-sm font-medium text-ink-1">
        Documents
      </label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        multiple
        accept={AI_IMPORT_ACCEPT}
        aria-describedby={`${id}-hint`}
        disabled={busy}
        className="max-w-full text-sm text-ink-1 file:tap-target file:mr-3 file:rounded-md file:border file:border-field-border file:bg-surface-1 file:px-3 file:font-semibold file:text-ink-1"
      />
      <p id={`${id}-hint`} className="text-sm text-ink-2">
        PDF, Word, Markdown or text · up to {AI_IMPORT_MAX_FILES} files, 25 MB each.
      </p>
      <p>
        <TextLink href="/help/instructor#ai-import" size="sm">
          How AI import works
        </TextLink>
      </p>
    </div>
  );
}
