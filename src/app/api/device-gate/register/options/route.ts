import { registerOptions } from "@/lib/deviceGate/handlers";
import { createGateStore } from "@/lib/deviceGate/store";

/** Starts registering a passkey for this device (ADR 0017). 404 off the staging host. */
export function POST(request: Request): Promise<Response> {
  return registerOptions(request, { store: createGateStore() });
}
