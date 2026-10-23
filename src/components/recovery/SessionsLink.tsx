import { TextLink } from "@/components/ui/TextLink";

/** A live page's way out besides Try again: the host's list of sessions, open and ended. */
export function SessionsLink() {
  return (
    <p>
      <TextLink href="/author/sessions">Back to live sessions</TextLink>
    </p>
  );
}
