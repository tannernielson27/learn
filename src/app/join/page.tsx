import type { Metadata } from "next";
import { JoinScreen } from "./JoinScreen";
import { readJoinAccount } from "./joinAccount";

export const metadata: Metadata = { title: "Join a live session" };

/**
 * Typed or bookmarked, with no code in the address yet. A signed-in student is told that a live
 * session for one of their classes counts toward it (ADR 0013); anyone else sees today's page.
 */
export default async function JoinPage({ searchParams }: PageProps<"/join">) {
  const { guest } = await searchParams;
  return <JoinScreen code="" account={await readJoinAccount("", guest === "1")} />;
}
