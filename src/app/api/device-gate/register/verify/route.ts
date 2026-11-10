import { registerVerify } from "@/lib/deviceGate/handlers";
import { createGateStore } from "@/lib/deviceGate/store";

/** Finishes registering a passkey and lets this device in (ADR 0017). 404 off the staging host. */
export function POST(request: Request): Promise<Response> {
  return registerVerify(request, { store: createGateStore() });
}
