import { fieldClasses } from "@/components/ui/fieldClasses";

/** The first choice, and the default: a quick live session, exactly as before ADR 0013. */
export const NO_CLASS_LABEL = "No class (anyone joins)";

export interface LiveClassSelectProps {
  /** For the label. A prop rather than `useId`, so the quiz page's server-rendered head can use it. */
  id: string;
  /** The teacher's classes, or null when they could not be read. */
  classes: readonly { id: string; name: string }[] | null;
}

/**
 * "For a class", inside a start form (ADR 0013). Choosing a class starts the live session for it:
 * anyone still joins with the join code, and a student signed in to the class has their answers
 * count toward it. Posts `classId`, empty for no class, which `startLiveSession` and
 * `startCaseStudyLiveSession` read. Nothing at all when there is no class to choose, so the form
 * posts what it posted before.
 */
export function LiveClassSelect({ id, classes }: LiveClassSelectProps) {
  if (!classes || classes.length === 0) return null;
  return (
    <div className="flex w-full max-w-xs flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink-1">
        For a class
      </label>
      <select
        id={id}
        name="classId"
        defaultValue=""
        aria-describedby={`${id}-hint`}
        className={fieldClasses("max-w-full px-3 text-base")}
      >
        <option value="">{NO_CLASS_LABEL}</option>
        {classes.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.name}
          </option>
        ))}
      </select>
      <p id={`${id}-hint`} className="text-sm text-ink-2">
        Students signed in to the class count toward it. Anyone else joins as a guest.
      </p>
    </div>
  );
}
