import type { SupabasePublicEnv } from "./env";
import { supabaseProjectRef } from "./projectRef";

export interface SupabaseHealth {
  status: "ok" | "unreachable";
  /** The project ref from the URL, `local` for the local stack, or `unknown`. Never a secret. */
  project: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 3_000;

/**
 * Asks the project's auth service whether it is up, and names which project that was. A free
 * project pauses after a week idle, and this is the quickest way to tell that apart from a wiring
 * fault; the ref tells production and a preview apart (ADR 0006). Errors are collapsed to
 * "unreachable" so nothing about the request leaks into a public response.
 */
export async function checkSupabaseHealth(
  env: SupabasePublicEnv,
  fetchImpl: FetchLike = fetch,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<SupabaseHealth> {
  const project = supabaseProjectRef(env.url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${env.url.replace(/\/+$/, "")}/auth/v1/health`, {
      headers: { apikey: env.publishableKey },
      cache: "no-store",
      signal: controller.signal,
    });
    return { status: response.ok ? "ok" : "unreachable", project };
  } catch {
    return { status: "unreachable", project };
  } finally {
    clearTimeout(timer);
  }
}
