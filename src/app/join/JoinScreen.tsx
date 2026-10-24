import Link from "next/link";
import { JoinForm } from "@/components/live/JoinForm";
import { WORDMARK_CLASSES } from "@/components/ui/AppShell";
import { textLinkClasses } from "@/components/ui/TextLink";
import { WELCOME_PATH } from "@/lib/auth/accountPaths";
import { joinLiveSession } from "./actions";
import type { JoinAccount } from "./joinAccount";

export interface JoinScreenProps {
  /** Already normalized, and empty when the address did not carry one. */
  code: string;
  /** Who is joining, for a signed-in student (ADR 0013). Absent or `none` is today's screen. */
  account?: JoinAccount;
}

/** What happens after Join, for the half of a laptop screen a phone does not have. */
const NEXT_STEPS: readonly [string, string][] = [
  ["Wait for your teacher", "Your name appears on the screen at the front while the class joins."],
  [
    "Answer on this screen",
    "Each question looks the way it will on the NCLEX. Your answer is locked in when you press Submit.",
  ],
  [
    "See the answer together",
    "When your teacher shows the answer, you see your own marks and the rationale.",
  ],
];

/**
 * The join screen, shared by `/join` and `/join/[code]` so the page a QR code opens and the page
 * someone types the address of are the same page (Main and JoinDesktop mockups).
 *
 * On a phone: one column, the two fields, and Join at the foot of the screen in thumb reach. From
 * `lg`: the form on the left and what happens next on the right.
 */
export function JoinScreen({ code, account = { kind: "none" } }: JoinScreenProps) {
  return (
    <main className="grid flex-1 lg:grid-cols-2">
      <section className="flex min-h-dvh flex-col px-5 pt-14 pb-8 lg:min-h-0 lg:border-r lg:border-line lg:bg-surface-1 lg:px-18">
        <Link href="/" className={`${WORDMARK_CLASSES} self-start`}>
          LeaRN
        </Link>
        <div className="mt-12 flex w-full max-w-md flex-1 flex-col gap-8 lg:my-auto lg:flex-none">
          <div className="flex flex-col gap-2">
            <h1 className="font-read text-4xl leading-tight text-ink-1 lg:text-5xl">
              Join a live session
            </h1>
            <p className="text-ink-2 lg:text-lg">No account needed.</p>
          </div>
          <AccountLine account={account} />
          <JoinForm
            action={joinLiveSession}
            code={code}
            defaultName={account.kind === "member" ? (account.name ?? undefined) : undefined}
            asGuest={account.kind === "guest"}
          />
        </div>
        {/* #362: a class code (two groups of four) is not a join code (two of three), and a
            student holding one is in the wrong place. The welcome page sends each person on. */}
        <p className="mt-3 text-center text-sm text-ink-2 lg:text-left">
          Have a class code like ABCD-2345?{" "}
          <Link href={WELCOME_PATH} className={textLinkClasses({ size: "sm" })}>
            Join your class
          </Link>
        </p>
      </section>

      <section
        aria-labelledby="next-heading"
        className="hidden flex-col justify-center gap-8 px-18 py-14 lg:flex"
      >
        <h2 id="next-heading" className="eyebrow">
          What happens next
        </h2>
        <ol className="flex max-w-md flex-col gap-7">
          {NEXT_STEPS.map(([title, detail], index) => (
            <li key={title} className="grid grid-cols-[3rem_1fr] gap-4">
              <span aria-hidden="true" className="font-mono text-3xl font-bold text-ink-2">
                {index + 1}
              </span>
              <div>
                <p className="text-lg font-semibold text-ink-1">{title}</p>
                <p className="mt-1 leading-normal text-ink-2">{detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

/**
 * One quiet line above the form for a signed-in student (ADR 0013): who is joining and whether it
 * counts toward a class, with the other choice as a link. Nothing at all for anyone else.
 */
function AccountLine({ account }: { account: JoinAccount }) {
  if (account.kind === "none") return null;
  const link = textLinkClasses({ size: "sm" });
  if (account.kind === "guest") {
    return (
      <p className="text-sm text-ink-2">
        Joining as a guest. Your answers do not count toward a class.{" "}
        <Link href={account.signedInHref} className={link}>
          Join with your account
        </Link>
      </p>
    );
  }
  if (account.kind === "student") {
    return (
      <p className="text-sm text-ink-2">
        {account.name ? `Signed in as ${account.name}. ` : ""}If this live session is for one of
        your classes, your answers count toward it.{" "}
        <Link href={account.guestHref} className={link}>
          Join as a guest instead
        </Link>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1 rounded-md border border-line bg-surface-1 px-4 py-3">
      <p className="font-semibold text-ink-1">
        {account.name
          ? `Joining as ${account.name} for ${account.className}.`
          : `Joining for ${account.className}.`}
      </p>
      <p className="text-sm text-ink-2">Your answers count toward the class.</p>
      <Link href={account.guestHref} className={`${link} self-start`}>
        Join as a guest instead
      </Link>
    </div>
  );
}
