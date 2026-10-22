import Link from "next/link";
import type { ComponentProps } from "react";

export type TextLinkKind = "standalone" | "inline";

/**
 * The classes a text link wears, for a link component of the caller's own (`GuardedLink`).
 *
 * - `standalone`: a link on its own line, such as "Back to the library". A 44px target, no
 *   underline until hover, semibold so it reads as a control (Foundation mockup `.link`).
 * - `inline`: a link inside a sentence. Underlined, so it is never told apart by colour alone
 *   (WCAG 1.4.1), and only as tall as the line it sits in.
 */
export function textLinkClasses({
  kind = "standalone",
  size = "base",
}: { kind?: TextLinkKind; size?: "sm" | "base" } = {}): string {
  const text = size === "sm" ? "text-sm" : "text-base";
  return kind === "inline"
    ? "text-accent-ink underline underline-offset-4 hover:no-underline"
    : `tap-target inline-flex items-center gap-1.5 ${text} font-semibold text-accent-ink ` +
        "underline-offset-4 hover:underline";
}

export type TextLinkProps = ComponentProps<typeof Link> & {
  kind?: TextLinkKind;
  size?: "sm" | "base";
};

/** One text link for the whole product, in place of the copied class strings (PLAN D12). */
export function TextLink({
  kind = "standalone",
  size = "base",
  className = "",
  ...rest
}: TextLinkProps) {
  return <Link className={`${textLinkClasses({ kind, size })} ${className}`.trim()} {...rest} />;
}
