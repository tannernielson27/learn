import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { joinCodeFromQuery } from "@/lib/live/joinForm";
import { joinPath } from "@/lib/live/routes";
import { JoinScreen } from "./JoinScreen";
import { readJoinAccount } from "./joinAccount";

export const metadata: Metadata = { title: "Join a live session" };

/**
 * Typed or bookmarked, with no code in the address yet. A signed-in student is told that a live
 * session for one of their classes counts toward it (ADR 0013); anyone else sees today's page.
 *
 * `?code=` is what the landing page's join code form sends when the browser has no JavaScript
 * (#563): a plain GET form. A code that could name a live session goes on to `/join/[code]`, the
 * page a QR code opens, so there is one join page with the code filled in. Anything else comes
 * back here with the field empty and the join form's own message on it. Nothing is looked up.
 */
export default async function JoinPage({ searchParams }: PageProps<"/join">) {
  const { guest, code } = await searchParams;
  const asGuest = guest === "1";
  const typed = joinCodeFromQuery(code);
  if (typed.status === "valid") {
    redirect(asGuest ? `${joinPath(typed.code)}?guest=1` : joinPath(typed.code));
  }
  return (
    <JoinScreen
      code=""
      codeError={typed.status === "invalid" ? typed.error : undefined}
      account={await readJoinAccount("", asGuest)}
    />
  );
}
