/** Loopback hosts, which mean the local Supabase stack rather than a hosted project. */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** The domains Supabase serves project URLs from. */
const HOSTED_DOMAINS = ["supabase.co", "supabase.in"];

/** A project ref is a fixed-length run of lowercase letters and digits, e.g. `vauokqoyvewtzubqajgh`. */
const REF_PATTERN = /^[a-z0-9]{20}$/;

/** What this deployment is talking to when no ref can be derived. */
const UNKNOWN = "unknown";

/** What this deployment is talking to when the URL points at the local stack. */
const LOCAL = "local";

/**
 * Names the Supabase project behind `NEXT_PUBLIC_SUPABASE_URL` so `/api/health` can say which one
 * a deployment reached — the whole point of the production split (ADR 0006).
 *
 * The ref is the public part of the project URL and is safe to publish; nothing else from the
 * variable ever escapes. Anything that is not a recognisable project URL comes back as `unknown`
 * rather than being echoed, so a mis-set variable (a pasted key, a stray path) cannot leak.
 */
export function supabaseProjectRef(url: string | undefined | null): string {
  const trimmed = url?.trim();
  if (!trimmed) return UNKNOWN;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return UNKNOWN;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(hostname)) return LOCAL;

  const domain = HOSTED_DOMAINS.find((candidate) => hostname.endsWith(`.${candidate}`));
  if (!domain) return UNKNOWN;

  const ref = hostname.slice(0, -(domain.length + 1));
  return REF_PATTERN.test(ref) ? ref : UNKNOWN;
}
