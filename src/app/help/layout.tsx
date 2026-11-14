import { HelpNav } from "@/components/help/HelpNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";

/**
 * Help is public and static (#269, kickoff decision 6): no session is read here, and /help is
 * not on the proxy's matcher, so a signed-out visitor reads it without an auth round trip.
 *
 * #563: the public site's header and footer, as pricing and the terms have them, with the help
 * pages' own navigation in a row under the header. The column is the site's; each page sets its
 * text at reading width inside it.
 */
export default function HelpLayout({ children }: LayoutProps<"/help">) {
  return (
    <>
      <SiteHeader />
      <HelpNav />
      <main className="mx-auto w-full max-w-site flex-1 px-4 pt-10 pb-16 sm:px-6 sm:pt-14 sm:pb-24 lg:px-10">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
