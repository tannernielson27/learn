/**
 * One answer for every invite link that does not lead to a class: unknown, rotated, malformed.
 * Saying which would tell a guesser which tokens once existed (#205).
 */
export const INVITE_UNAVAILABLE_HEADING = "This invite link does not work";

export const INVITE_UNAVAILABLE_TEXT =
  "It may have been replaced with a new one. Ask your instructor for the current link.";

export function InviteUnavailable() {
  return (
    <section aria-labelledby="invite-unavailable-heading">
      <h1 id="invite-unavailable-heading" className="mb-3 font-read text-3xl text-ink-1">
        {INVITE_UNAVAILABLE_HEADING}
      </h1>
      <p className="text-ink-2">{INVITE_UNAVAILABLE_TEXT}</p>
    </section>
  );
}
