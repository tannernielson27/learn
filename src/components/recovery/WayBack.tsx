import { TextLink } from "@/components/ui/TextLink";
import { STUDENT_HOME } from "@/lib/classes/classes";
import { JOIN_PATH } from "@/lib/live/routes";

/** Where a page that could not be shown sends someone, besides Try again. */
export type WayBackTo = "library" | "student-home" | "sessions" | "join";

const WAYS: Record<WayBackTo, { href: string; label: string }> = {
  // A teacher's home (docs/glossary.md "Library").
  library: { href: "/author", label: "Back to the library" },
  // A student's home, which stays "Your classes".
  "student-home": { href: STUDENT_HOME, label: "Back to your classes" },
  // A live page's list: the host's sessions, open and ended.
  sessions: { href: "/author/sessions", label: "Back to live sessions" },
  // The student room's: the form a join code is typed into. A guest has no home to go back to.
  join: { href: JOIN_PATH, label: "Back to the join page" },
};

/**
 * The one way back on an error or not-found page (#563, docs/04 §11 "Error"): a standalone
 * `TextLink` under the state's main action, its words naming where it goes, a 44px target. A
 * plain link rather than the leave guard's: the page that held unsaved work is already gone.
 */
export function WayBack({ to }: { to: WayBackTo }) {
  const { href, label } = WAYS[to];
  return (
    <p>
      <TextLink href={href}>{label}</TextLink>
    </p>
  );
}
