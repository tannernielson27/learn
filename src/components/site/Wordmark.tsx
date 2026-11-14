import Link from "next/link";

/**
 * The LeaRN wordmark for the public site (#563): "Lea" in the reading serif and "RN" set apart in
 * a hairline box, the way a credential follows a nurse's name. Styled text, so it is crisp at any
 * size, follows the theme and reads as "LeaRN" to a screen reader (no space between the parts).
 *
 * The signed-in app keeps its own plain wordmark (`WORDMARK_CLASSES` in AppShell) until the app
 * takes this look on; the favicon (`src/app/icon.svg`) is unchanged.
 */
export function Wordmark({ href = "/", size = "md" }: { href?: string; size?: "md" | "lg" }) {
  const text = size === "lg" ? "text-3xl" : "text-2xl";
  return (
    <Link
      href={href}
      className={`tap-target inline-flex items-center font-read ${text} leading-none tracking-tight text-ink-1`}
    >
      <span className="font-normal">Lea</span>
      <span className="ml-0.5 rounded-sm border border-rule-strong px-1 pt-0.5 pb-1 font-semibold">
        RN
      </span>
    </Link>
  );
}
