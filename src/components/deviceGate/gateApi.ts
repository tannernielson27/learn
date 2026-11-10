/** The device gate's API from the browser (ADR 0017). Same-origin JSON, no caching. */

export interface GateReply {
  readonly status: number;
  readonly data: Record<string, unknown>;
}

export async function gateRequest(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<GateReply> {
  const response = await fetch(path, {
    method: init.method ?? "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
  } catch {
    // An empty or non-JSON body leaves `data` empty; the status still says what happened.
  }
  return { status: response.status, data };
}

/** What to tell the person for each refusal the API can give. */
export function gateErrorMessage(error: unknown): string {
  switch (error) {
    case "code":
      return "That enrollment code is not right.";
    case "invite":
      return "This invite link has been used or has expired. Ask for a new one.";
    case "name":
      return "Give this device a name of up to 60 characters.";
    case "unknown":
      return "This device's passkey is not registered, or it was revoked. Add the device again.";
    case "passkey":
      return "The passkey could not be checked. Try again.";
    case "challenge":
      return "That took too long. Try again.";
    case "last":
      return "This is the only device that can open staging. Add another before revoking it.";
    case "misconfigured":
      return "Staging is not set up yet.";
    default:
      return "Something went wrong. Try again.";
  }
}

/** True when the person closed the browser's passkey prompt rather than something failing. */
export function wasCancelled(error: unknown): boolean {
  return (
    error instanceof Error && (error.name === "NotAllowedError" || error.name === "AbortError")
  );
}
