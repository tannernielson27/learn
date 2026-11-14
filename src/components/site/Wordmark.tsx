import Link from "next/link";

export type WordmarkSize = "md" | "lg";

/**
 * The classes the wordmark's link wears, for a link component of the caller's own (the author
 * layout's `GuardedLink`, which asks before leaving unsaved work). Put `<WordmarkMark />` inside.
 */
export function wordmarkClasses(size: WordmarkSize = "md"): string {
  const text = size === "lg" ? "text-3xl" : "text-2xl";
  return `tap-target inline-flex items-center font-read ${text} leading-none tracking-tight text-ink-1`;
}

/** The wordmark's letters, for a caller that draws its own link around them. */
export function WordmarkMark() {
  return (
    <>
      <span className="font-normal">Lea</span>
      <span className="ml-0.5 rounded-sm border border-rule-strong px-1 pt-0.5 pb-1 font-semibold">
        RN
      </span>
    </>
  );
}

/**
 * The LeaRN wordmark (#563): "Lea" in the reading serif and "RN" set apart in a hairline box, the
 * way a credential follows a nurse's name. Styled text, so it is crisp at any size, follows the
 * theme and reads as "LeaRN" to a screen reader (no space between the parts).
 *
 * The public site's bar and the signed-in app's `AppShell` both draw it (docs/04 §11); the root
 * status screens keep the plain `WORDMARK_CLASSES`, and the favicon (`src/app/icon.svg`) is
 * unchanged.
 */
export function Wordmark({ href = "/", size = "md" }: { href?: string; size?: WordmarkSize }) {
  return (
    <Link href={href} className={wordmarkClasses(size)}>
      <WordmarkMark />
    </Link>
  );
}
