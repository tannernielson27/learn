import { shownName } from "@/lib/auth/displayName";

export interface SignedInAsProps {
  displayName: string | null;
  email: string;
}

/**
 * Who is signed in (#358), at the top of the account menu (owner decision 2026-11-14, docs/04
 * §11: the email address lives in the menu, not in the bar). The account's name when it has one,
 * with the email address under it; the email address alone otherwise. Both wrap rather than cut
 * off, so a long address is read whole. Text only, so React escapes whatever the name holds.
 */
export function SignedInAs({ displayName, email }: SignedInAsProps) {
  const shown = shownName({ displayName, email });
  const named = shown !== email;
  return (
    <div className="min-w-0 px-3 py-2.5">
      <p
        className="font-semibold wrap-anywhere text-ink-1"
        data-testid={named ? "signed-in-name" : "signed-in-email"}
      >
        {shown}
      </p>
      {named ? (
        <p className="mt-0.5 text-sm wrap-anywhere text-ink-2" data-testid="signed-in-address">
          {email}
        </p>
      ) : null}
    </div>
  );
}
