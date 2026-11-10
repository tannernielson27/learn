import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AuthFrame, AUTH_HEADING, AUTH_SUBLINE } from "@/components/auth/AuthFrame";
import { DevicesPanel } from "@/components/deviceGate/DevicesPanel";
import { isGatedHost } from "@/lib/deviceGate/config";

export const metadata: Metadata = {
  title: "Staging devices",
  robots: { index: false, follow: false },
};

/** The devices that can open staging (ADR 0017). The proxy lets only one of them this far. */
export default async function DevicesPage() {
  if (!isGatedHost((await headers()).get("host"))) notFound();
  return (
    <AuthFrame>
      <h1 className={AUTH_HEADING}>Staging devices</h1>
      <p className={AUTH_SUBLINE}>
        Every device that can open staging. Revoking one locks it at once.
      </p>
      <DevicesPanel />
    </AuthFrame>
  );
}
