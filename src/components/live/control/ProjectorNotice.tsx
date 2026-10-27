import { Monitor } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export interface ProjectorNoticeProps {
  /** `/live/[sessionId]?view=projector`, opened in a second window. */
  projectorHref: string;
  /** Switches this window to the projector view, full screen where the browser allows it. */
  onPresent: () => void;
}

/**
 * How to put the projector view up (LobbyControl mockup): in a second window dragged to the
 * projector, or on this screen when the laptop is the one being projected. Either way it is the
 * same live session, fed by the same room.
 */
export function ProjectorNotice({ projectorHref, onPresent }: ProjectorNoticeProps) {
  return (
    <section
      aria-labelledby="projector-heading"
      className="flex items-start gap-3 rounded-md bg-notice-soft px-4 py-3.5 text-notice"
    >
      <Icon icon={Monitor} className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id="projector-heading" className="font-semibold">
          Show the class the projector view
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <a
            href={projectorHref}
            target="_blank"
            rel="noopener"
            className={buttonClasses({ variant: "secondary" })}
          >
            Open in a new window
          </a>
          <button type="button" onClick={onPresent} className={buttonClasses({ variant: "ghost" })}>
            Present on this screen
          </button>
        </div>
      </div>
    </section>
  );
}
