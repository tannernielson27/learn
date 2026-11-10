import { unlockOptions } from "@/lib/deviceGate/handlers";
import { createGateStore } from "@/lib/deviceGate/store";

/** Starts unlocking with this device's passkey (ADR 0017). 404 off the staging host. */
export function POST(request: Request): Promise<Response> {
  return unlockOptions(request, { store: createGateStore() });
}
