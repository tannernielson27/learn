export interface WordmarkProps {
  /** `md` in a header, `sm` in the footer. */
  size?: "sm" | "md";
  className?: string;
}

const SIZES = { sm: "text-lg", md: "text-xl" } as const;

/**
 * The LeaRN wordmark for the public site (#563): the serif name, with the R and N that stand for
 * RN in record ink and a short rule under them, like the initials a nurse signs a note with. Text,
 * so it is the link's name as it stands ("LeaRN") and needs no asset; the rule is decoration.
 */
export function Wordmark({ size = "md", className = "" }: WordmarkProps) {
  return (
    <span
      className={`inline-flex items-baseline font-read font-semibold tracking-tight text-ink-1 ${SIZES[size]} ${className}`.trim()}
    >
      Lea
      <span className="relative text-brand">
        RN
        <span
          aria-hidden="true"
          className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-sm bg-brand"
        />
      </span>
    </span>
  );
}
