/** Where a signed-in account that is not an author is sent (#204): "No access yet". */
export const NO_ACCESS_PATH = "/author/no-access";

const AUTHOR_HOME = "/author";

export type AccessStatus = "ok" | "signed_out" | "forbidden";

/**
 * The No access page is only for a signed-in account with no author role. Anyone else is sent to
 * their own home: an author to the bank list, a signed-out visitor to sign in (and on to
 * authoring once they have). Returns null to stay on the page.
 */
export function noAccessRedirect(status: AccessStatus): string | null {
  if (status === "ok") return AUTHOR_HOME;
  if (status === "signed_out") return `/sign-in?next=${encodeURIComponent(AUTHOR_HOME)}`;
  return null;
}
