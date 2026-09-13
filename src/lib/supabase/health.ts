import type { SupabasePublicEnv } from "./env";

export interface SupabaseHealth {
  status: "ok" | "unreachable";
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 3_000;

/**
 * Asks the project's auth service whether it is up. A free project pauses after a week idle,
 * and this is the quickest way to tell that apart from a wiring fault. Errors are collapsed to
 * "unreachable" so nothing about the request leaks into a public response.
 */
export async function checkSupabaseHealth(
  env: SupabasePublicEnv,
  fetchImpl: FetchLike = fetch,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<SupabaseHealth> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${env.url.replace(/\/+$/, "")}/auth/v1/health`, {
      headers: { apikey: env.publishableKey },
      cache: "no-store",
      signal: controller.signal,
    });
    return { status: response.ok ? "ok" : "unreachable" };
  } catch {
    return { status: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}
