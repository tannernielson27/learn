/**
 * What leaves the app for Sentry (#235). Pure: no Sentry, React or Next imports, so the rules can
 * be tested on their own and applied to every event, transaction and breadcrumb the same way.
 *
 * The owner decision is "no student data leaves the app". Sentry's own `sendDefaultPii: false`
 * is the first layer; this is the second, and the one that knows what this app's secrets look
 * like: invite tokens in `/c/<token>`, join codes in `/join/<code>` and in prose, session ids in
 * `/live/...` and `/play/...`, and the answer keys and rationales a student must not see.
 *
 * The rules fail towards removing too much. A debug detail lost is cheap; a student's email in a
 * third party's database is not.
 */

/** Keys whose value is dropped whatever it holds. Compared lower-case with `_` and `-` removed. */
const DROPPED_KEYS = new Set([
  // Who someone is.
  "user",
  "email",
  "emails",
  "emailaddress",
  "displayname",
  "fullname",
  "firstname",
  "lastname",
  "username",
  "ipaddress",
  // What a student must not see, and what a student wrote.
  "answerkey",
  "correctoptionid",
  "rationale",
  "rationales",
  "answer",
  "answers",
  "responses",
  // Credentials and the links that act as them.
  "cookie",
  "cookies",
  "setcookie",
  "authorization",
  "password",
  "secret",
  "token",
  "tokenhash",
  "accesstoken",
  "refreshtoken",
  "invitetoken",
  "joincode",
  "sessioncode",
  // Bodies, logged arguments and a stack frame's local variables: any of them can hold any of the
  // above under a name nobody predicted.
  "body",
  "requestbody",
  "responsebody",
  "arguments",
  "vars",
]);

/** The request headers worth keeping. Everything else, cookies and forwarded IPs included, goes. */
const KEPT_HEADERS = new Set(["user-agent", "content-type", "accept", "accept-language"]);

/** Deep enough for any real event; a guard against a cycle or a pathological payload. */
const MAX_DEPTH = 24;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

/**
 * A path segment after one of the routes whose segment is a secret or names a live room: the
 * invite token, the join code, and the session ids. `/api/live/...` is the app's own API, whose
 * next segment is an action name, so it is matched and given back unchanged. A segment that opens
 * with `[` is a route pattern such as `[token]` in a transaction name or a chunk path, not a value.
 */
const SECRET_SEGMENT = /(\/api)?\/(c|join|live|play)\/([^/?#\s"'<>[\]][^/?#\s"'<>]*)/g;

/** A query string or fragment that carries parameters. Both are dropped whole. */
const QUERY = /\?[^\s#"'<>]*=[^\s#"'<>]*/g;
const FRAGMENT = /#[^\s"'<>]*=[^\s"'<>]*/g;

/**
 * A long run of mixed-case letters and digits, the shape of an invite token (32 base64url
 * characters) or an API key. Lower-case hex, such as a UUID or a chunk hash, has no capitals and
 * is kept, because ids are how an error is traced to a row.
 */
const LONG_TOKEN = /[A-Za-z0-9_-]{24,}/g;
const looksLikeToken = (run: string) => /[A-Z]/.test(run) && /[a-z]/.test(run) && /\d/.test(run);

/**
 * A join code said in prose: six characters from SESSION_CODE_ALPHABET (no 0, 1, I or O). About
 * one code in six is letters only, so a digit cannot be required. Every such run is masked except
 * a short list of words error messages really use; a plain word lost now and then is cheap.
 */
const JOIN_CODE = /\b[2-9A-HJ-NP-Z]{6}\b/g;
const READABLE_WORDS = new Set([
  "SELECT",
  "UPDATE",
  "DELETE",
  "CREATE",
  "SCHEMA",
  "HEADER",
  "BEFORE",
  "RETURN",
  "NUMBER",
]);
const looksLikeJoinCode = (run: string) => !READABLE_WORDS.has(run);

/** A percent escape. A string holding one is decoded before the rules run. */
const ESCAPE = /%[0-9A-Fa-f]{2}/;

/**
 * An encoded link (`%2Fc%2F<token>`) would slip past every path and query rule, so it is decoded
 * first. A malformed escape cannot be decoded and is scrubbed as it stands.
 */
function decoded(value: string): string {
  if (!ESCAPE.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Masks every secret this app knows the shape of, anywhere in a string. */
export function scrubString(value: string): string {
  return decoded(value)
    .replace(JWT, "[jwt]")
    .replace(EMAIL, "[email]")
    .replace(SECRET_SEGMENT, (match, api: string | undefined, route: string) =>
      api ? match : `/${route}/[redacted]`,
    )
    .replace(QUERY, "?[filtered]")
    .replace(FRAGMENT, "#[filtered]")
    .replace(LONG_TOKEN, (run) => (looksLikeToken(run) ? "[token]" : run))
    .replace(JOIN_CODE, (run) => (looksLikeJoinCode(run) ? "[code]" : run));
}

/** A URL with the query and fragment removed and any secret path segment masked. */
export function scrubUrl(url: string): string {
  const end = url.search(/[?#]/);
  return scrubString(end === -1 ? url : url.slice(0, end));
}

const normalizeKey = (key: string) => key.toLowerCase().replace(/[_-]/g, "");

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function scrubValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return "[depth limit]";
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map((entry) => scrubValue(entry, depth + 1));
  if (isPlainObject(value)) return scrubObject(value, depth);
  return value;
}

function scrubObject(value: Record<string, unknown>, depth: number): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !DROPPED_KEYS.has(normalizeKey(key)))
      .map(([key, entry]) => [key, scrubValue(entry, depth + 1)]),
  );
}

function keptHeaders(headers: unknown): Record<string, string> | undefined {
  if (!isPlainObject(headers)) return undefined;
  const kept = Object.entries(headers).filter(
    (entry): entry is [string, string] =>
      KEPT_HEADERS.has(entry[0].toLowerCase()) && typeof entry[1] === "string",
  );
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

/**
 * The request, rebuilt from an allowlist rather than cleaned: the method, the URL without its
 * query, and a few harmless headers. Cookies, the body, the query string and the server's
 * environment are never copied, so a field Sentry adds later is left out by default.
 */
function scrubRequest(request: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(request)) return undefined;
  const headers = keptHeaders(request.headers);
  return {
    ...(typeof request.method === "string" ? { method: request.method } : {}),
    ...(typeof request.url === "string" ? { url: scrubUrl(request.url) } : {}),
    ...(headers ? { headers } : {}),
  };
}

/**
 * A scrubbed copy of a Sentry event or transaction. The input is not changed. The user is removed
 * outright: the app never sets one, and an opaque id is still more than an error report needs.
 */
export function scrubEvent<T extends object>(event: T): T {
  const { request, ...rest } = event as Record<string, unknown>;
  const scrubbed = scrubObject(rest, 0);
  const cleanRequest = scrubRequest(request);
  return (cleanRequest ? { ...scrubbed, request: cleanRequest } : scrubbed) as T;
}

/** A scrubbed copy of a breadcrumb, by the same rules. */
export function scrubBreadcrumb<T extends object>(breadcrumb: T): T {
  return scrubObject(breadcrumb as Record<string, unknown>, 0) as T;
}
