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
    <p
      id={id}
      data-feedback-mark=""
      className={`mt-2 border-l-2 border-line pl-3 text-sm text-ink-2 ${className}`.trim()}
    >
      {text.value}
    </p>
  );
}
