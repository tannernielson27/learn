import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-sm font-medium select-none " +
  "transition-[background-color,border-color,color,opacity] duration-fast ease-out-expo " +
  "disabled:cursor-not-allowed disabled:opacity-50 tap-target";

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
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`.trim()}
      {...rest}
    />
  );
}
