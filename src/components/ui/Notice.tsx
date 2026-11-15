import { CircleAlert, Info, type LucideIcon } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { Icon } from "./Icon";

export type NoticeRole = "status" | "alert";

export interface NoticeProps {
  /** A short bold line above the body: "Reconnecting". */
  title?: ReactNode;
  children?: ReactNode;
  /**
   * `status` (the default) is read when it appears and waits its turn. `alert` interrupts: only
   * for something that stops what the person was doing, such as a form that did not save or a
   * payment that failed. The two look different as well as sound different (#563).
   */
  role?: NoticeRole;
  /**
   * `false` keeps the look of `role` without the live region: for a notice that is part of the
   * page when it loads, such as the Billing state, so a screen reader is not interrupted on every
   * visit. Leave it on for a notice that appears after something happens.
   */
  live?: boolean;
  /** Another Lucide icon in place of the role's own mark: `WifiOff` for a dropped connection. */
  icon?: LucideIcon;
  /** One way to act on it, under the words: a `Button` or a `TextLink`. */
  action?: ReactNode;
  className?: string;
  /** For a notice that takes focus when it appears: `tabIndex={-1}` and a ref to focus it by. */
  ref?: Ref<HTMLDivElement>;
  id?: string;
  tabIndex?: number;
}

// Both neutral (PLAN D11): never feedback red or green, which belong to marked answers. A status
// is a quiet grey panel; an alert adds the strong ink rule around it, heavier down its leading
// edge, and an alert mark, so it never reads as calm as a status does.
const ROLE_CLASSES: Record<NoticeRole, string> = {
  status: "px-4",
  alert: "border border-l-4 border-rule-strong pr-4 pl-3",
};

const ROLE_ICONS: Record<NoticeRole, LucideIcon> = { status: Info, alert: CircleAlert };

/**
 * A system message: a neutral panel with an icon and words (PLAN D11). A failed save and a
 * reconnecting phone share the colours; what tells them apart is the alert's rule and mark.
 */
export function Notice({
  title,
  children,
  role = "status",
  live = true,
  icon,
  action,
  className = "",
  ref,
  id,
  tabIndex,
}: NoticeProps) {
  return (
    <div
      ref={ref}
      id={id}
      tabIndex={tabIndex}
      role={live ? role : undefined}
      data-notice={role}
      className={`flex items-start gap-3 rounded-md bg-notice-soft py-3.5 text-base leading-snug text-notice ${ROLE_CLASSES[role]} ${className}`.trim()}
    >
      <Icon icon={icon ?? ROLE_ICONS[role]} className="mt-0.5" />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? "text-ink-2" : undefined}>{children}</div> : null}
        {action ? <div className="mt-2 flex flex-wrap gap-3">{action}</div> : null}
      </div>
    </div>
  );
}
