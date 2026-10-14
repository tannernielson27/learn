import Link from "next/link";

const LINK =
  "tap-target inline-flex items-center text-sm font-medium text-accent-ink hover:underline";

/** A live page's way out besides Try again: the host's list of sessions, open and ended. */
export function SessionsLink() {
  return (
    <p>
      <Link href="/author/sessions" className={LINK}>
        Back to live sessions
      </Link>
    </p>
  );
}
