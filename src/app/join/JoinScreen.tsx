import { JoinForm } from "@/components/live/JoinForm";
import { joinLiveSession } from "./actions";

export interface JoinScreenProps {
  /** Already normalized, and empty when the address did not carry one. */
  code: string;
}

/**
 * The join screen, shared by `/join` and `/join/[code]` so the page a QR code opens and the page
 * someone types the address of are the same page.
 */
export function JoinScreen({ code }: JoinScreenProps) {
  return (
    <main className="flex flex-1 items-start justify-center px-4 pt-12 pb-12 sm:items-center sm:pt-0">
      <div className="w-full max-w-sm">
        <p className="eyebrow mb-2">LeaRN</p>
        <h1 className="mb-2 font-read text-3xl text-ink-1">Join a session</h1>
        <p className="mb-8 text-ink-2">
          No account needed. Enter the code on the screen and the name the class should see.
        </p>
        <JoinForm action={joinLiveSession} code={code} />
      </div>
    </main>
  );
}
