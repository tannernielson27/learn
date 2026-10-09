import { FocusHeading } from "@/components/status/FocusHeading";
import { StatusLinks } from "@/components/status/StatusLinks";
import {
  INVITE_CLOSED,
  INVITE_CLOSED_HEADING,
  INVITE_NOT_VALID_HEADING,
  INVITE_NOT_VALID_TEXT,
  INVITE_REFUSED,
  INVITE_REFUSED_HEADING,
  type InviteAnswer,
} from "@/lib/workspace/invite";

const HEADING = "font-read text-3xl break-words text-ink-1 outline-none";

function Notice({ id, heading, text }: { id: string; heading: string; text: string }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <FocusHeading id={id} className={HEADING}>
        {heading}
      </FocusHeading>
      <p className="text-ink-2">{text}</p>
      <StatusLinks />
    </section>
  );
}

/**
 * One page for every link that leads to no invitation: a missing, malformed or unknown token, and
 * a caller the lookup has stopped answering. It takes nothing, so it cannot say which.
 */
export function InviteNotValid() {
  return (
    <Notice
      id="workspace-invite-not-valid"
      heading={INVITE_NOT_VALID_HEADING}
      text={INVITE_NOT_VALID_TEXT}
    />
  );
}

/**
 * What an invitation page shows once it has an answer that is not a way in: the one not-valid
 * page, an invitation that has expired, been withdrawn or been used, or an account the database
 * will not make a teacher. The heading takes focus, whether this is the page's first render or the
 * answer to a form. An `error` is the form's own to show and renders nothing here.
 */
export function InviteAnswerView({ answer }: { answer: InviteAnswer }) {
  if (answer.status === "invalid") return <InviteNotValid />;
  if (answer.status === "closed") {
    return (
      <Notice
        id="workspace-invite-closed"
        heading={INVITE_CLOSED_HEADING}
        text={INVITE_CLOSED[answer.state]}
      />
    );
  }
  if (answer.status === "refused") {
    return (
      <Notice
        id="workspace-invite-refused"
        heading={INVITE_REFUSED_HEADING}
        text={INVITE_REFUSED[answer.reason]}
      />
    );
  }
  return null;
}
