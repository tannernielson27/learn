import type { ReactNode } from "react";
import { Wordmark } from "@/components/site/Wordmark";

/**
 * The page around a sign-in, sign-up, account or invite form (Main mockup): the LeaRN wordmark,
 * a 48px gap, then the form's own serif heading, short subline and 52px fields in one column.
 * Top-aligned on a phone so the keyboard never covers the first field; centred from 640px.
 *
 * #563: the public site's editorial look (docs/design/landing-563/A.md, "How it carries"). The
 * site's wordmark over a single column on paper, a near-black rule opening the column the way it
 * opens a section on the landing page, and the heading in `.display-section`. No drawing.
 *
 * `landmark={false}` draws the same frame as a `div`, for the gallery (`/gallery/states`), whose
 * own layout already holds the page's one main.
 */
export function AuthFrame({
  children,
  landmark = true,
}: {
  children: ReactNode;
  landmark?: boolean;
}) {
  const Main = landmark ? "main" : "div";
  return (
    <Main className="flex flex-1 justify-center px-4 pt-10 pb-12 sm:items-center sm:px-6 sm:py-14">
      <div className="w-full max-w-md">
        <p className="mb-8 sm:mb-10">
          <Wordmark />
        </p>
        <div className="border-t border-rule-strong pt-6">{children}</div>
      </div>
    </Main>
  );
}

/** A form page's h1 with a subline under it. */
export const AUTH_HEADING = "display-section mb-3 break-words";
/** A form page's h1 with nothing between it and the form. */
export const AUTH_HEADING_ALONE = "display-section mb-8 break-words";
/** The short line under the heading. */
export const AUTH_SUBLINE = "mb-8 break-words text-ink-2";
