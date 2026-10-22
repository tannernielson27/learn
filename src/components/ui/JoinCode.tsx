import { encodeQr, qrSvgPath, qrViewBoxSize } from "@/lib/live/qrCode";
import { normalizeSessionCode } from "@/lib/live/sessionCode";

export interface JoinCodeProps {
  /** The session's code, in any spacing or case. */
  code: string;
  /** Where to type it, as printed: "learn-nclex.app/join". */
  url: string;
  /** The absolute join address for a QR code beside the code. No QR when absent. */
  qrUrl?: string;
  /** `app` for the console; `stage` for the projector, where the code is about 160px tall. */
  size?: "app" | "stage";
  className?: string;
}

/** The code's two halves, as people read it aloud: "V96 RN8". */
export function codeGroups(code: string): [string, string] {
  const normalized = normalizeSessionCode(code);
  return [normalized.slice(0, 3), normalized.slice(3)];
}

const SIZES = {
  app: {
    lead: "text-base text-ink-2",
    url: "font-mono font-semibold text-ink-1",
    code: "text-(length:--joincode-size) gap-[0.5ch]",
    qr: "size-40",
    caption: "text-sm text-ink-2",
  },
  stage: {
    lead: "text-stage-option font-medium",
    url: "font-mono font-bold",
    code: "text-(length:--joincode-size-stage) gap-[0.6ch]",
    qr: "size-[33cqb] rounded-md border-(length:--stage-stroke) border-stage-line",
    caption: "text-stage-label text-ink-2",
  },
} as const;

/**
 * The join address as a QR code, as `SessionQrCode` draws it: never themed, because a reversed
 * code is one most cameras will not read (`--qr-dark`, `--qr-light`). Nothing when it cannot be
 * encoded; the code beside it still works.
 */
function JoinQr({ url, className }: { url: string; className: string }) {
  const matrix = encodeQr(url);
  if (!matrix) return null;
  const side = qrViewBoxSize(matrix);
  return (
    <svg
      viewBox={`0 0 ${side} ${side}`}
      role="img"
      aria-label="QR code for joining this live session"
      className={className}
      shapeRendering="crispEdges"
    >
      <rect width={side} height={side} fill="var(--qr-light)" />
      <path d={qrSvgPath(matrix)} fill="var(--qr-dark)" />
    </svg>
  );
}

/**
 * Where to go and what to type, first; the QR code second, because it only scans from the front
 * rows (PLAN §5.1). The code is mono with a gap between its two groups of three.
 */
export function JoinCode({ code, url, qrUrl, size = "app", className = "" }: JoinCodeProps) {
  const look = SIZES[size];
  const [first, second] = codeGroups(code);
  return (
    <section
      aria-label="Join code"
      className={`flex flex-wrap items-center gap-x-12 gap-y-6 ${className}`.trim()}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <p className={look.lead}>
          Go to <span className={look.url}>{url}</span> and type
        </p>
        {/* The space between the halves is real text, so it is copied and read; flex drops it
            from the layout and the gap does the spacing. */}
        <p
          data-testid="join-code"
          className={`flex font-mono leading-none font-semibold tracking-[0.08em] ${look.code}`}
        >
          <span>{first}</span> <span>{second}</span>
        </p>
      </div>
      {qrUrl ? (
        <figure className="m-0 flex flex-col items-center gap-2">
          <JoinQr url={qrUrl} className={look.qr} />
          <figcaption className={look.caption}>Or scan from the front rows</figcaption>
        </figure>
      ) : null}
    </section>
  );
}
