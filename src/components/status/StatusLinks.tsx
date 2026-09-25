import Link from "next/link";

const LINK =
  "tap-target inline-flex items-center text-sm font-medium text-accent-ink hover:underline";

/**
 * Where to go from a page that could not help (#267): home, or sign in. Real links, so Tab
 * reaches them and they open in a new tab like any other.
 */
export function StatusLinks() {
  return (
    <p className="flex flex-wrap gap-x-6">
      <Link href="/" className={LINK}>
        Go to the home page
      </Link>
      <Link href="/sign-in" className={LINK}>
        Sign in
      </Link>
    </p>
  );
}
