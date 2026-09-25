import { FocusHeading } from "@/components/status/FocusHeading";
import { StatusLinks } from "@/components/status/StatusLinks";

/**
 * One answer for every invite link that does not lead to a class: unknown, rotated, malformed, or
 * opened by a student the instructor removed (`join_class` answers `invalid` for all of them).
 * Saying which would tell a guesser which tokens once existed (#205), so the copy names the likely
 * causes without choosing, and says who can fix it (#267). The heading takes focus, whether this is
 * the page's first render or the answer to a form.
 */
export const INVITE_UNAVAILABLE_HEADING = "This invite link does not work";

export const INVITE_UNAVAILABLE_TEXT =
  "It may have been replaced, or you may have been removed from the class. Ask your instructor for a new link.";

export function InviteUnavailable() {
  return (
    <section aria-labelledby="invite-unavailable-heading" className="flex flex-col gap-4">
      <FocusHeading
        id="invite-unavailable-heading"
        className="font-read text-3xl text-ink-1 outline-none"
      >
        {INVITE_UNAVAILABLE_HEADING}
      </FocusHeading>
      <p className="text-ink-2">{INVITE_UNAVAILABLE_TEXT}</p>
      <StatusLinks />
    </section>
  );
}
