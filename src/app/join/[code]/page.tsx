import type { Metadata } from "next";
import { isSessionCode, normalizeSessionCode } from "@/lib/live/sessionCode";
import { JoinScreen } from "../JoinScreen";

export const metadata: Metadata = { title: "Join a session" };

/**
 * Where the QR code on the host's screen points. The code is filled in, not acted on: nothing is
 * looked up until a name is submitted, so this page is the same page whether the code is real or
 * a misread scan, and a camera cannot be used to probe which codes exist.
 *
 * A segment that could not be a code at all leaves the field empty rather than 404ing — someone
 * whose scan went wrong should land on the form, not on an error.
 */
export default async function JoinWithCodePage({ params }: PageProps<"/join/[code]">) {
  const { code } = await params;
  const normalized = normalizeSessionCode(code);
  return <JoinScreen code={isSessionCode(normalized) ? normalized : ""} />;
}
