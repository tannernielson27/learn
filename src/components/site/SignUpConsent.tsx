import { TextLink } from "@/components/ui/TextLink";
import { PRIVACY_PATH, TERMS_PATH } from "@/lib/site/links";

/**
 * The one line under every form that makes an account (#522): open sign-up, a class invite and a
 * workspace invitation. Creating the account is the agreement, so there is no checkbox.
 */
export function SignUpConsent() {
  return (
    <p className="text-sm text-ink-2">
      By creating an account, you agree to the{" "}
      <TextLink href={TERMS_PATH} kind="inline">
        Terms of Service
      </TextLink>{" "}
      and{" "}
      <TextLink href={PRIVACY_PATH} kind="inline">
        Privacy Policy
      </TextLink>
      .
    </p>
  );
}
