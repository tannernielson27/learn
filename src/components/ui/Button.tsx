import type { ButtonHTMLAttributes, MouseEvent } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
/** `sm` for dense rows (still 44px tall), `md` 44px, `lg` 56px for the main action on a phone. */
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** The full width of its container: Submit in a phone's bottom bar. */
  block?: boolean;
  /**
   * Working on it: the press was taken and the result is on its way (#563). The label stays, the
   * button keeps its width, and a thin mark fills once along its foot (`motion-busy`, still under
   * reduced motion). It stays focusable, unlike `disabled`, so focus is not dropped mid-save; it
   * announces `aria-busy` and `aria-disabled`, and a second press does nothing, not even submit.
   */
  busy?: boolean;
}

/**
 * The press: a control sinks a little under the finger or the pointer while it is held down
 * (`press` in globals.css). Transform only, so nothing around it moves; reduced motion turns it
 * off through `--press-scale`. Exported for links that look like buttons, so both feel the same.
 */
export const PRESS_CLASSES =
  "press transition-[background-color,border-color,color,opacity,scale] duration-fast ease-out-expo";

// Disabled reads as a grey, quiet control rather than a faded coloured one (Foundation mockup).
const base =
  "relative inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap select-none " +
  `${PRESS_CLASSES} tap-target disabled:cursor-not-allowed ` +
  "disabled:border-line disabled:bg-surface-2 disabled:text-ink-2";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-contrast border border-accent hover:bg-accent-ink active:bg-accent-ink",
  // The field's 3:1 edge, not the 1.4:1 divider (WCAG 1.4.11, PLAN D9).
  secondary:
    "bg-surface-1 text-ink-1 border border-field-border hover:bg-surface-2 active:bg-surface-2",
  ghost: "bg-transparent text-accent-ink border border-transparent hover:bg-accent-soft",
};

const sizes: Record<ButtonSize, string> = {
  sm: "px-3 text-sm",
  md: "min-h-(--button-height-md) px-4 text-base",
  lg: "min-h-(--button-height-lg) px-6 text-lg",
};

/**
 * The classes a `Button` wears, for a `Link` or a download `<a>` that should look and press like
 * one. A link is still a link: this changes how it looks, not what it is.
 */
export function buttonClasses({
  variant = "secondary",
  size = "md",
  block = false,
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean } = {}): string {
  return `${base} ${variants[variant]} ${sizes[size]}${block ? " w-full" : ""}`;
}

/** The busy mark: a bar in the label's own colour, inset from the corners, under the words. */
const BUSY_MARK =
  "motion-busy pointer-events-none absolute inset-x-3 bottom-1.5 h-0.5 rounded-full bg-current";

export function Button({
  variant = "secondary",
  size = "md",
  block = false,
  busy = false,
  className = "",
  type = "button",
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const swallow = (event: MouseEvent<HTMLButtonElement>) => event.preventDefault();
  return (
    <button
      type={type}
      className={`${buttonClasses({ variant, size, block })}${busy ? " cursor-progress" : ""} ${className}`.trim()}
      {...rest}
      {...(busy ? { "aria-busy": true, "aria-disabled": true } : {})}
      onClick={busy ? swallow : onClick}
    >
      {children}
      {busy ? <span aria-hidden="true" data-busy-mark="" className={BUSY_MARK} /> : null}
    </button>
  );
}
