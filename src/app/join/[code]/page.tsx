import type { Metadata } from "next";
import { isSessionCode, normalizeSessionCode } from "@/lib/live/sessionCode";
import { JoinScreen } from "../JoinScreen";
import { readJoinAccount } from "../joinAccount";

export const metadata: Metadata = { title: "Join a live session" };

/**
 * Where the QR code on the host's screen points. The code is filled in, not acted on: for anyone
 * signed out nothing is looked up until a name is submitted, so this page is the same page whether
 * the code is real or a misread scan, and a camera cannot be used to probe which codes exist.
 *
 * A signed-in student is the one exception (ADR 0013): when the code is an open live session for
 * one of their own classes, the page says "Joining as … for …" and fills in their name. The lookup
 * answers nothing about any other session, so it tells them only what their teacher already did.
 *
 * A segment that could not be a code at all leaves the field empty rather than 404ing — someone
 * whose scan went wrong should land on the form, not on an error.
 */
export default async function JoinWithCodePage({
  params,
  searchParams,
}: PageProps<"/join/[code]">) {
  const [{ code }, { guest }] = await Promise.all([params, searchParams]);
  const normalized = normalizeSessionCode(code);
  const valid = isSessionCode(normalized) ? normalized : "";
  return <JoinScreen code={valid} account={await readJoinAccount(valid, guest === "1")} />;
}
