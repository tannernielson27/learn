import { shownName } from "@/lib/auth/displayName";

export interface SignedInAsProps {
  displayName: string | null;
  email: string;
}

/**
 * Who is signed in, in the header (#358): the account's name when it has one, the email address
 * otherwise. Text only, so React escapes whatever the name holds.
 */
export function SignedInAs({ displayName, email }: SignedInAsProps) {
  const shown = shownName({ displayName, email });
  const named = shown !== email;
  return (
    <p
      className="truncate text-sm text-ink-2"
      data-testid={named ? "signed-in-name" : "signed-in-email"}
    >
      {shown}
    </p>
  );
}
