import { Info, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export interface NoticeProps {
  /** A short bold line above the body: "Reconnecting". */
  title?: ReactNode;
  children?: ReactNode;
  /**
   * `status` (the default) is read when it appears and waits its turn. `alert` interrupts: only
   * for something that stops what the person was doing, such as a form that did not save.
   */
  role?: "status" | "alert";
  /** Another Lucide icon in place of the info mark: `WifiOff` for a dropped connection. */
  icon?: LucideIcon;
  className?: string;
}

/**
 * A system message: a neutral panel with an icon and words (PLAN D11). Never feedback red or
 * green, which belong to marked answers; a failed save and a reconnecting phone look the same.
 */
export function Notice({
  title,
  children,
  role = "status",
  icon = Info,
  className = "",
}: NoticeProps) {
  return (
    <div
      role={role}
      className={`flex items-start gap-3 rounded-md bg-notice-soft px-4 py-3.5 text-base leading-snug text-notice ${className}`.trim()}
    >
      <Icon icon={icon} className="mt-0.5" />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? "text-ink-2" : undefined}>{children}</div> : null}
      </div>
    </div>
  );
}
