import { TextLink } from "@/components/ui/TextLink";

/**
 * Where to go from a page that could not help (#267): home, or sign in. Real links, so Tab
 * reaches them and they open in a new tab like any other; each a 44px standalone `TextLink`.
 */
export function StatusLinks() {
  return (
    <p className="flex flex-wrap gap-x-6">
      <TextLink href="/">Go to the home page</TextLink>
      <TextLink href="/sign-in">Sign in</TextLink>
    </p>
  );
}
