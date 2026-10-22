import { buttonClasses } from "@/components/ui/Button";
import { ARCHIVE_ONE } from "@/lib/authoring/archiveSelection";

export interface ArchiveRowButtonProps {
  /** The quiz page's selection form, which asks before anything is archived (#471). */
  formId: string;
  kind: "item" | "caseStudy";
  id: string;
  /** The row's name: the question's text or the case study's title. */
  name: string;
}

/**
 * A row's own Archive. It sits outside the selection form and sends it, carrying only this row;
 * the form opens the confirm and archives this row alone, whatever else is checked.
 */
export function ArchiveRowButton({ formId, kind, id, name }: ArchiveRowButtonProps) {
  return (
    <div className="flex shrink-0 items-center px-2">
      <button
        type="submit"
        form={formId}
        name={ARCHIVE_ONE}
        value={`${kind}:${id}`}
        data-archive-name={name}
        aria-label={`Archive ${name}`}
        className={buttonClasses({ variant: "ghost", size: "sm" })}
      >
        Archive
      </button>
    </div>
  );
}
