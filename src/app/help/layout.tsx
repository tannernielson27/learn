import Link from "next/link";

const NAV = [
  { href: "/help", label: "Help" },
  { href: "/help/instructor", label: "Instructor guide" },
  { href: "/help/items", label: "Item guide" },
] as const;

const linkClass =
  "tap-target inline-flex items-center rounded-sm px-2 text-sm text-ink-2 transition-colors duration-fast hover:bg-surface-2 hover:text-ink-1";

/**
 * Help is public and static (#269, kickoff decision 6): no session is read here, and /help is
 * not on the proxy's matcher, so a signed-out visitor reads it without an auth round trip.
 */
export default function HelpLayout({ children }: LayoutProps<"/help">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-2">
        <Link
          href="/"
          className="tap-target flex items-center font-mono text-sm tracking-wide text-ink-2 uppercase hover:text-ink-1"
        >
          LeaRN
        </Link>
        <nav aria-label="Help">
          <ul className="flex flex-wrap items-center gap-1">
            {NAV.map((entry) => (
              <li key={entry.href}>
                <Link href={entry.href} className={linkClass}>
                  {entry.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
