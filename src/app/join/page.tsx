import type { Metadata } from "next";
import { JoinScreen } from "./JoinScreen";

export const metadata: Metadata = { title: "Join a session" };

/** Typed or bookmarked, with no code in the address yet. */
export default function JoinPage() {
  return <JoinScreen code="" />;
}
