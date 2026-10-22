import { WifiOff } from "lucide-react";
import { Icon } from "@/components/ui/Icon";

/**
 * The phone has lost the room and is getting it back (PhoneReconnecting mockup, PLAN §5.7): a
 * dark band across the top that cannot be mistaken for the question, in words. Submit is held off
 * underneath it and the answer in progress is kept.
 */
export function ReconnectingBanner() {
  return (
    <div
      role="status"
      data-testid="reconnecting"
      className="-mx-4 flex items-center gap-3 bg-ink-1 px-5 py-3.5 text-surface-0"
    >
      <Icon icon={WifiOff} />
      <div className="min-w-0">
        <p className="font-bold">Reconnecting</p>
        <p className="text-sm">Stay on this page. Your answer is kept.</p>
      </div>
    </div>
  );
}
