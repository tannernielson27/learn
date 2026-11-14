import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readJoinCode } from "@/lib/live/joinForm";
import { JoinScreen } from "./JoinScreen";
import { readJoinAccount } from "./joinAccount";

export const metadata: Metadata = { title: "Join a live session" };

/**
 * Typed or bookmarked, with no code in the address yet. A signed-in student is told that a live
 * session for one of their classes counts toward it (ADR 0013); anyone else sees today's page.
 *
 * `?code=` is what the landing page's join field sends without JavaScript (#563), a plain GET
 * form. A code that could be one goes on to `/join/[code]`, the page a QR code opens, so there is
 * one join screen; anything else stays here with the field empty and says what a join code is.
 * Nothing is looked up either way, as on `/join/[code]`.
 */
export default async function JoinPage({ searchParams }: PageProps<"/join">) {
  const { guest, code } = await searchParams;
  const asGuest = guest === "1";
  if (code === undefined) {
    return <JoinScreen code="" account={await readJoinAccount("", asGuest)} />;
  }
  const typed = readJoinCode(Array.isArray(code) ? code[0] : code);
  if (typed.ok) redirect(asGuest ? `${typed.href}?guest=1` : typed.href);
  return (
    <JoinScreen code="" codeError={typed.error} account={await readJoinAccount("", asGuest)} />
  );
}
