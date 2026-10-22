import type { LucideIcon, LucideProps } from "lucide-react";

export type IconSize = "app" | "stage";

export interface IconProps extends Omit<LucideProps, "size" | "strokeWidth" | "ref"> {
  /** The Lucide icon: `import { Folder } from "lucide-react"`. One import per icon, tree-shaken. */
  icon: LucideIcon;
  /** `app`: 20px, stroke 1.75 (docs/04 §7). `stage`: 32px, stroke 2.5, for the projector. */
  size?: IconSize;
  /**
   * What the icon says, when nothing beside it does. Without one the icon is decoration and is
   * hidden from assistive technology, which is the usual case: an icon sits next to its word.
   */
  label?: string;
}

const SIZES: Record<IconSize, { px: number; stroke: number }> = {
  app: { px: 20, stroke: 1.75 },
  stage: { px: 32, stroke: 2.5 },
};

/**
 * Every icon in the product, through one door (PLAN §8). Not a client component itself, so a
 * Server Component can render one; the Lucide icon is.
 */
export function Icon({ icon: Glyph, size = "app", label, className = "", ...rest }: IconProps) {
  const { px, stroke } = SIZES[size];
  const named = label !== undefined && label !== "";
  return (
    <Glyph
      size={px}
      strokeWidth={stroke}
      className={`shrink-0 ${className}`.trim()}
      {...(named ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      focusable="false"
      {...rest}
    />
  );
}
