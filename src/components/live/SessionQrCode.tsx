import { encodeQr, qrSvgPath, qrViewBoxSize } from "@/lib/live/qrCode";

export interface SessionQrCodeProps {
  /** The absolute join URL, from `joinUrl()`. */
  url: string;
  /** What the picture is for, read by a screen reader instead of the URL itself. */
  label: string;
  className?: string;
}

/**
 * The join URL as a QR code: one inline SVG, drawn on the server, with no script and no image
 * request. It is the whole of "scan this and you are in the room".
 *
 * Deliberately not themed. The plate is white and the modules are near-black in both themes
 * (`--qr-dark` / `--qr-light`), because a reversed QR code is one most phone cameras will not
 * read — see the note beside those tokens.
 *
 * Returns nothing at all when the URL is too long to encode, which a join URL cannot be. The
 * code is printed as text beside this, so a page that loses the picture still works.
 */
export function SessionQrCode({ url, label, className = "" }: SessionQrCodeProps) {
  const matrix = encodeQr(url);
  if (!matrix) return null;

  const side = qrViewBoxSize(matrix);
  return (
    <svg
      viewBox={`0 0 ${side} ${side}`}
      role="img"
      aria-label={label}
      className={className}
      // Without this a browser smooths the module edges and a scanner sees a blur.
      shapeRendering="crispEdges"
    >
      {/* The quiet zone is part of the code: four light modules on every side. */}
      <rect width={side} height={side} fill="var(--qr-light)" />
      <path d={qrSvgPath(matrix)} fill="var(--qr-dark)" />
    </svg>
  );
}
