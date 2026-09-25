import Image from "next/image";
import type { HelpFigure as Figure } from "@/lib/help/itemGuide";

/**
 * A screenshot on a help page: a copy of a committed Playwright baseline (#269), drawn at its
 * real size's aspect ratio so nothing shifts while it loads.
 */
export function HelpFigure({ figure, caption }: { figure: Figure; caption: string }) {
  return (
    <figure className="mt-4 flex flex-col gap-2">
      <Image
        src={`/${figure.src}`}
        width={figure.width}
        height={figure.height}
        alt={figure.alt}
        sizes="(min-width: 768px) 720px, 100vw"
        className="h-auto w-full rounded-md border border-line bg-surface-1"
      />
      <figcaption className="text-sm text-ink-2">{caption}</figcaption>
    </figure>
  );
}
