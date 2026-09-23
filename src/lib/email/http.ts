import { EmailError } from "./types";

// A provider error name we are willing to repeat: `validation_error`, `rate_limit_exceeded`.
const ERROR_CODE = /^[a-z][a-z0-9_]{0,63}$/;

/** POSTs JSON and returns the parsed reply, or throws a typed EmailError. Never logs. */
export async function postJson(
  fetchImpl: typeof fetch,
  provider: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  // Outside the try: a body that cannot be serialized is a bug here, not a network failure.
  const payload = JSON.stringify(body);
  let response: Response;
  try {
    response = await fetchImpl(url, { method: "POST", headers, body: payload, cache: "no-store" });
  } catch {
    throw new EmailError("network", `${provider} could not be reached.`);
  }
  const reply = await response.json().catch(() => undefined);
  if (!response.ok) throw statusError(provider, response, reply);
  return reply;
}

function statusError(provider: string, response: Response, reply: unknown): EmailError {
  const status = response.status;
  const code = errorCode(reply);
  const detail = `${provider} answered ${status}${code ? ` (${code})` : ""}.`;
  if (status === 429) {
    const retryAfterSeconds = retryAfter(response.headers.get("retry-after"));
    return new EmailError("rate_limited", detail, { status, code, retryAfterSeconds });
  }
  if (status >= 500) return new EmailError("unavailable", detail, { status, code });
  return new EmailError("rejected", detail, { status, code });
}

/** Seconds from a Retry-After header; an HTTP date or anything else is ignored. */
function retryAfter(header: string | null): number | undefined {
  if (header === null || !/^\d{1,6}$/.test(header.trim())) return undefined;
  return Number(header.trim());
}

/**
 * Only the machine-readable `name` of a provider error. Its `message` is dropped on purpose:
 * Resend's validation messages can quote the recipient's address.
 */
function errorCode(reply: unknown): string | undefined {
  if (typeof reply !== "object" || reply === null) return undefined;
  const name = (reply as { name?: unknown }).name;
  return typeof name === "string" && ERROR_CODE.test(name) ? name : undefined;
}

/** Reads a string id out of a 2xx reply; a reply without one is not treated as sent. */
export function requireId(provider: string, reply: unknown, field: string): string {
  const id =
    typeof reply === "object" && reply !== null
      ? (reply as Record<string, unknown>)[field]
      : undefined;
  if (typeof id !== "string" || id.length === 0) {
    throw new EmailError("unavailable", `${provider} accepted the request but returned no id.`);
  }
  return id;
}
