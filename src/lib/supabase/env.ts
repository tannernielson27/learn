export interface SupabasePublicEnv {
  url: string;
  publishableKey: string;
}

interface RawSupabasePublicEnv {
  url: string | undefined;
  publishableKey: string | undefined;
}

const URL_VAR = "NEXT_PUBLIC_SUPABASE_URL";
const KEY_VAR = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * Reads the two values every Supabase client needs. Both are public by design: row level
 * security, not the key, protects data. The defaults name each variable statically so Next can
 * inline them into the browser bundle.
 */
export function readSupabasePublicEnv(
  raw: RawSupabasePublicEnv = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  },
): SupabasePublicEnv {
  const url = raw.url?.trim();
  const publishableKey = raw.publishableKey?.trim();

  if (!url) throw new Error(`${URL_VAR} is not set. Copy .env.example to .env.local.`);
  if (!publishableKey) throw new Error(`${KEY_VAR} is not set. Copy .env.example to .env.local.`);

  assertProjectUrl(url);
  assertPublishableKey(publishableKey);
  return { url, publishableKey };
}

function assertProjectUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${URL_VAR} is not a valid URL.`);
  }
  if (parsed.protocol === "https:") return;
  if (parsed.protocol === "http:" && LOCAL_HOSTS.has(parsed.hostname)) return;
  throw new Error(`${URL_VAR} must use https; plain http is allowed only for a local stack.`);
}

function assertPublishableKey(value: string): void {
  if (value.startsWith("sb_secret_") || isServiceRoleJwt(value)) {
    throw new Error(
      `${KEY_VAR} holds a secret key, which would ship to every browser. Use the publishable key.`,
    );
  }
}

function isServiceRoleJwt(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as {
      role?: unknown;
    };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}
