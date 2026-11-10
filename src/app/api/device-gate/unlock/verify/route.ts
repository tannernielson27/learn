import { unlockVerify } from "@/lib/deviceGate/handlers";
import { createGateStore } from "@/lib/deviceGate/store";

/** Checks this device's passkey and lets it in (ADR 0017). 404 off the staging host. */
export function POST(request: Request): Promise<Response> {
  return unlockVerify(request, { store: createGateStore() });
}
