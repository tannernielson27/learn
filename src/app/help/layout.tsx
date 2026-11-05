import Link from "next/link";
import { SiteFooter } from "@/components/site/SiteFooter";
import { AppShell } from "@/components/ui/AppShell";

const NAV = [
  { href: "/help", label: "Help" },
  { href: "/help/instructor", label: "Teacher guide" },
  { href: "/help/items", label: "Question guide" },
] as const;

const linkClass =
  "tap-target inline-flex items-center rounded-md px-3 text-sm font-semibold text-ink-2 transition-colors duration-fast hover:bg-surface-2 hover:text-ink-1";

/**
 * Help is public and static (#269, kickoff decision 6): no session is read here, and /help is
 * not on the proxy's matcher, so a signed-out visitor reads it without an auth round trip. So it
 * has the shell's bar and its own navigation, and no account menu. Public, so it ends with the
 * site footer (#522).
 */
export default function HelpLayout({ children }: LayoutProps<"/help">) {
  return (
    <>
      <AppShell
        homeHref="/"
        nav={
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
        }
      >
        {children}
      </AppShell>
      <SiteFooter />
    </>
  );
}
