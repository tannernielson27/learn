/**
 * The hosted project's Auth settings, read through the Supabase Management API (#307), and the
 * judgements on them. Invites broke in #304 because the redirect allow-list did not admit the
 * origin the app emailed: Supabase does not refuse such a redirect, it silently sends the Site URL
 * instead, and the email template turned that into a link that goes nowhere. Until now this was a
 * MANUAL line; with `SUPABASE_ACCESS_TOKEN` set, `pnpm golive:check` checks it.
 */
import type { FetchLike } from "./sources.ts";
import type { CheckResult } from "./types.ts";

/** The fields read; every one is optional, because a missing field must fail, not crash. */
export interface AuthConfig {
  site_url?: unknown;
  uri_allow_list?: unknown;
  mailer_templates_magic_link_content?: unknown;
  mailer_otp_length?: unknown;
}

export const AUTH_CONFIG_URL = (ref: string): string =>
  `https://api.supabase.com/v1/projects/${ref}/config/auth`;

/** Reads the Auth config. A refusal throws its status only: the body could echo the token. */
export async function readAuthConfig(
  fetchImpl: FetchLike,
  ref: string,
  token: string,
): Promise<AuthConfig> {
  const response = await fetchImpl(AUTH_CONFIG_URL(ref), {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from the Supabase Management API`);
  }
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null) throw new Error("the Auth config was not JSON");
  return body as AuthConfig;
}

const escapeRegExp = (text: string) => text.replace(/[.+^${}()|[\]\\]/g, "\\$&");

/**
 * Whether one allow-list entry admits `url`, the way GoTrue matches it: a glob over the whole URL,
 * query included, where `**` matches anything and `*` and `?` stop at "." and "/".
 */
export function allowListMatches(entry: string, url: string): boolean {
  const pattern = entry
    .split("**")
    .map((part) =>
      part
        .split("*")
        .map((piece) => piece.split("?").map(escapeRegExp).join("[^./]"))
        .join("[^./]*"),
    )
    .join(".*");
  return new RegExp(`^${pattern}$`).test(url);
}

const line = (id: string, title: string, pass: boolean, detail: string): CheckResult => ({
  id,
  title,
  status: pass ? "pass" : "fail",
  detail,
});

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

function originOf(value: string | null): string | null {
  if (!value || !URL.canParse(value)) return null;
  return new URL(value).origin;
}

const URLS_TITLE = "Auth Site URL and redirect URLs admit the site's sign-in links";
const TEMPLATE_TITLE = "the magic-link template carries the token-hash link and the code";

/** Both lines this module prints, so a failed read can fail each of them by name. */
export const AUTH_CHECK_TITLES = [
  { id: "auth-urls", title: URLS_TITLE },
  { id: "auth-template", title: TEMPLATE_TITLE },
] as const;
const LINK = "{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email";
const CODE = "{{ .Token }}";

function urlsCheck(config: AuthConfig, site: string): CheckResult {
  const siteUrl = text(config.site_url);
  if (originOf(siteUrl) !== site) {
    return line(
      "auth-urls",
      URLS_TITLE,
      false,
      `Site URL is ${siteUrl ?? "not set"}, not ${site}; a refused redirect goes there (docs/05 §7.7 step 5)`,
    );
  }
  const entries = (text(config.uri_allow_list) ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  // What the app emails: /auth/confirm on the site, with next in the query.
  const link = `${site}/auth/confirm?next=%2Flearn`;
  if (!entries.some((entry) => allowListMatches(entry, link))) {
    return line(
      "auth-urls",
      URLS_TITLE,
      false,
      `no Redirect URL admits ${site}/auth/confirm; add ${site}/** (docs/05 §7.7 step 5)`,
    );
  }
  return line("auth-urls", URLS_TITLE, true, `Site URL ${site}; the allow-list admits its links`);
}

function templateCheck(config: AuthConfig): CheckResult {
  const template = text(config.mailer_templates_magic_link_content) ?? "";
  const missing = [
    template.includes(`href="${LINK}"`) ? null : "the token_hash link to /auth/confirm",
    template.includes(CODE) ? null : `the code (${CODE})`,
  ].filter((item): item is string => item !== null);
  const length = config.mailer_otp_length;
  const lengthOk = typeof length === "number" && length >= 6 && length <= 10;
  if (!lengthOk)
    missing.push(`an Email OTP Length of 6 to 10 (it is ${String(length ?? "unset")})`);
  if (missing.length > 0) {
    return line(
      "auth-template",
      TEMPLATE_TITLE,
      false,
      `missing ${missing.join("; ")}; paste supabase/templates/magic_link.html (docs/05 §7.7 step 3)`,
    );
  }
  return line(
    "auth-template",
    TEMPLATE_TITLE,
    true,
    `link, code and a ${String(length)}-digit length`,
  );
}

/** Two lines: the URLs (the #304 failure) and the template the app's sign-in depends on. */
export function authConfigChecks(config: AuthConfig, site: string): CheckResult[] {
  return [urlsCheck(config, site), templateCheck(config)];
}
