import { listDevices, manageDevices } from "@/lib/deviceGate/handlers";
import { createGateStore } from "@/lib/deviceGate/store";

/** Lists, invites and revokes devices, from a device already in (ADR 0017). */
export function GET(request: Request): Promise<Response> {
  return listDevices(request, { store: createGateStore() });
}

export function POST(request: Request): Promise<Response> {
  return manageDevices(request, { store: createGateStore() });
}
