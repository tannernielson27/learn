import type { RichText } from "@/lib/ngn/schemas";

export interface ElementRationaleProps {
  /** Id the element points at with aria-describedby, so a reader hears this after it. */
  id: string;
  text?: RichText;
  className?: string;
}

/**
 * Why one option, row or blank was right or wrong, shown beside the element itself rather than
 * gathered into a list at the end (docs/01-NGN-ITEM-SPEC.md §4.4). Feedback mode only: renderers
 * never receive `rationale` before then, because "option C is wrong because…" is an answer key.
 */
export function ElementRationale({ id, text, className = "" }: ElementRationaleProps) {
  if (!text) return null;
  return (
    // No data-feedback-mark: that hook staggers the small correct and incorrect glyphs, and a
    // paragraph of prose scaling into place alongside them reads as noise, not as clarification.
    <p
      id={id}
      className={`mt-2 border-l-2 border-line pl-3 text-sm text-ink-2 ${className}`.trim()}
    >
      {text.value}
    </p>
  );
}

export interface ExplainedElement {
  /** Id of the explanation, which the element's control points at with aria-describedby. */
  id: string;
  /** The element's own words, e.g. a highlighted phrase or a bowtie choice. */
  label: string;
  text?: RichText;
}

/**
 * Explanations for several elements that share one place: the phrases of one sentence or table
 * cell, or the choices of one bowtie column (#49). Each is named after its element when it could
 * otherwise be read as belonging to its neighbour: always with `labelled`, else only when there
 * is more than one. Renders nothing when none of the elements has an explanation.
 */
export function ElementRationaleList({
  items,
  labelled = false,
  className = "",
}: {
  items: readonly ExplainedElement[];
  labelled?: boolean;
  className?: string;
}) {
  const explained = items.filter((item) => item.text);
  if (explained.length === 0) return null;
  const named = labelled || explained.length > 1;
  return (
    <div className={`flex flex-col gap-3 ${className}`.trim()}>
      {explained.map((item) => (
        <div key={item.id}>
          {named ? <p className="text-xs font-medium text-ink-2">{item.label}</p> : null}
          <ElementRationale id={item.id} text={item.text} />
        </div>
      ))}
    </div>
  );
}
