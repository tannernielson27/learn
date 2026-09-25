/** What a digest Next derives from a server error looks like: a short run of letters and digits. */
const DIGEST = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The reference an error page may show (#267, Sprint 11 kickoff decision 4): the `digest` Next
 * puts on an error from a Server Component, which matches the server's log line and says nothing
 * else. Anything that does not look like one — missing, not a string, or text with spaces or
 * punctuation that could be a message someone put there — gives nothing, so an error page never
 * shows more than a hash.
 */
export function errorDigest(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("digest" in error)) return undefined;
  const { digest } = error;
  return typeof digest === "string" && DIGEST.test(digest) ? digest : undefined;
}
