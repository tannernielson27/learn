import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AuthFrame, AUTH_HEADING, AUTH_SUBLINE } from "@/components/auth/AuthFrame";
import { DeviceGatePanel } from "@/components/deviceGate/DeviceGatePanel";
import { isGatedHost } from "@/lib/deviceGate/config";
import { safeNextPath } from "@/lib/auth/nextPath";

export const metadata: Metadata = {
  title: "Staging",
  robots: { index: false, follow: false },
  // An invite link carries its token in the address, so nothing here sends it on.
  referrer: "no-referrer",
};

/**
 * The staging device gate's front door (ADR 0017). Only the staging host has one; anywhere else
 * this page does not exist.
 */
export default async function DeviceGatePage({ searchParams }: PageProps<"/device-gate">) {
  if (!isGatedHost((await headers()).get("host"))) notFound();
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeNextPath(params.next) : "/";
  const invite = typeof params.invite === "string" && params.invite ? params.invite : null;

  return (
    <AuthFrame>
      <h1 className={AUTH_HEADING}>Staging</h1>
      <p className={AUTH_SUBLINE}>
        This is the test copy of LeaRN. It opens only on devices that have been added.
      </p>
      <DeviceGatePanel next={next} invite={invite} />
    </AuthFrame>
  );
}
