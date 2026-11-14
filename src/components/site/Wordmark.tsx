import Link from "next/link";

export interface WordmarkProps {
  href?: string;
  /** `paper` on the page's own surface; `brand` on the navy band, where the ink is light. */
  tone?: "paper" | "brand";
  className?: string;
}

const TONES = {
  paper: "text-ink-1",
  brand: "text-brand-ink",
} as const;

/**
 * The LeaRN wordmark of the public pages (#563): set in Inter, "Lea" at a medium weight and "RN"
 * heavier with a rule under it, because the capital R and N stand for Registered Nurse. Styled
 * text, so its name is "LeaRN" to a screen reader and it needs no file. The app keeps its own
 * (`WORDMARK_CLASSES` in AppShell) until the direction reaches it.
 */
export function Wordmark({ href = "/", tone = "paper", className = "" }: WordmarkProps) {
  return (
    <Link
      href={href}
      className={`tap-target inline-flex items-center rounded-sm font-ui text-2xl leading-none tracking-display ${TONES[tone]} ${className}`.trim()}
    >
      <span className="font-medium">Lea</span>
      <span className="border-b-[3px] border-current pb-0.5 font-extrabold">RN</span>
    </Link>
  );
}
