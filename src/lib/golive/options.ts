/** `pnpm golive:check`'s command line (#237). Pure, so options.test.ts can pin it. */
import { parseArgs } from "node:util";
import { readSupabasePublicEnv } from "../supabase/env.ts";

export const USAGE = `Usage:
  pnpm golive:check -- --url <site> --project-ref <ref> [--publishable-key <sb_publishable_...>]
  pnpm golive:check -- --url <site> --local

  --url <site>              the deployment to check, e.g. https://learn-tanner-nielsons-projects.vercel.app
  --project-ref <ref>       the hosted Supabase project; queries run through the Supabase CLI's login
                            (pnpm exec supabase login, or SUPABASE_ACCESS_TOKEN)
  --local                   the local stack instead (pnpm exec supabase start)
  --publishable-key <key>   the project's sb_publishable_ key (public) for the exposed-schemas probe;
                            also read from GOLIVE_PUBLISHABLE_KEY. The local stack's is found by itself
  --supabase-url <url>      override https://<ref>.supabase.co (or the local stack's API URL)

Environment (never pass secrets as flags; they end up in shell history):
  GOLIVE_HEALTH_TOKEN       the deployment's CRON_SECRET, to see which variable is missing

Read-only: it runs SELECTs and GETs, never writes, and prints no secret. Docs: docs/05 "Go-live".`;

const REF = /^[a-z0-9]{20}$/;

export type Target = { kind: "local" } | { kind: "hosted"; ref: string };

export interface CliOptions {
  help: boolean;
  siteUrl: string;
  target: Target;
  /** Null means the default for the target (the hosted URL, or ask the local stack). */
  supabaseUrl: string | null;
  publishableKey: string | null;
  healthToken: string | null;
}

function siteUrl(value: string | undefined): string {
  if (!value) throw new Error("--url is required.");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("--url must be a URL such as https://example.vercel.app.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("--url must use https (or http for a local server).");
  }
  return parsed.origin;
}

function target(ref: string | undefined, local: boolean): Target {
  if (local && ref) throw new Error("Pass --project-ref or --local, not both.");
  if (local) return { kind: "local" };
  if (!ref) throw new Error("Pass --project-ref <ref> (or --local for the local stack).");
  if (!REF.test(ref)) throw new Error("--project-ref must be 20 lowercase letters and digits.");
  return { kind: "hosted", ref };
}

const blank = (value: string | undefined): string | null => value?.trim() || null;

export function readOptions(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): CliOptions {
  const { values } = parseArgs({
    args: [...argv].filter((arg) => arg !== "--"),
    options: {
      url: { type: "string" },
      "project-ref": { type: "string" },
      local: { type: "boolean", default: false },
      "publishable-key": { type: "string" },
      "supabase-url": { type: "string" },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });
  const healthToken = blank(env.GOLIVE_HEALTH_TOKEN);
  if (values.help) {
    return {
      help: true,
      siteUrl: "",
      target: { kind: "local" },
      supabaseUrl: null,
      publishableKey: null,
      healthToken,
    };
  }
  return {
    help: false,
    siteUrl: siteUrl(values.url),
    target: target(values["project-ref"], values.local),
    supabaseUrl: blank(values["supabase-url"]),
    publishableKey: blank(values["publishable-key"]) ?? blank(env.GOLIVE_PUBLISHABLE_KEY),
    healthToken,
  };
}

/**
 * Checks the Supabase URL and key the same way the app does: https (or a local http host), and
 * never a secret key, which the probe would otherwise send to the network.
 */
export function checkedSupabase(
  url: string,
  publishableKey: string | null,
): {
  url: string;
  publishableKey: string | null;
} {
  if (publishableKey === null) {
    const env = readSupabasePublicEnv({ url, publishableKey: "sb_publishable_placeholder" });
    return { url: env.url, publishableKey: null };
  }
  const env = readSupabasePublicEnv({ url, publishableKey });
  return { url: env.url, publishableKey: env.publishableKey };
}

export function defaultSupabaseUrl(target: Target): string | null {
  return target.kind === "hosted" ? `https://${target.ref}.supabase.co` : null;
}
