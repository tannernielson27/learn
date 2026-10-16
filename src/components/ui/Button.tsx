import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * The press: a control sinks a little under the finger or the pointer while it is held down
 * (`press` in globals.css). Transform only, so nothing around it moves; reduced motion turns it
 * off through `--press-scale`. Exported for links that look like buttons, so both feel the same.
 */
export const PRESS_CLASSES =
  "press transition-[background-color,border-color,color,opacity,scale] duration-fast ease-out-expo";

const base =
  "inline-flex items-center justify-center gap-2 rounded-sm font-medium select-none " +
  `${PRESS_CLASSES} disabled:cursor-not-allowed disabled:opacity-50 tap-target`;

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-contrast border border-accent hover:bg-accent-ink active:bg-accent-ink",
  secondary:
    "bg-surface-1 text-ink-1 border border-line hover:bg-surface-2 hover:border-line-strong active:bg-surface-2",
  ghost: "bg-transparent text-accent-ink border border-transparent hover:bg-accent-soft",
};

const sizes: Record<ButtonSize, string> = {
  sm: "px-3 text-sm",
  md: "px-4 text-base",
};

/**
 * The classes a `Button` wears, for a `Link` or a download `<a>` that should look and press like
 * one. A link is still a link: this changes how it looks, not what it is.
 */
export function buttonClasses({
  variant = "secondary",
  size = "md",
}: { variant?: ButtonVariant; size?: ButtonSize } = {}): string {
  return `${base} ${variants[variant]} ${sizes[size]}`;
}

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${buttonClasses({ variant, size })} ${className}`.trim()}
      {...rest}
    />
  );
}
