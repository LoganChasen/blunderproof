"use client";

import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cx, focusRing } from "./cx";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white border-b-4 border-accent-shade hover:bg-accent-hover active:border-b-2 active:translate-y-[2px] shadow-[0_2px_0_rgb(0_0_0/0.15)]",
  secondary:
    "bg-surface-2 text-text border-b-4 border-black/35 hover:bg-surface-3 active:border-b-2 active:translate-y-[2px]",
  ghost: "bg-transparent text-muted hover:bg-surface-2 hover:text-text",
  danger: "bg-danger text-white border-b-4 border-danger-shade hover:brightness-110 active:border-b-2 active:translate-y-[2px]",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-[15px] gap-2",
  lg: "h-12 px-6 text-base gap-2",
  xl: "h-16 px-8 text-xl gap-3",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", block = false): string {
  return cx(
    "inline-flex select-none items-center justify-center rounded-md font-bold whitespace-nowrap transition-[background-color,transform,filter] duration-100",
    "disabled:pointer-events-none disabled:opacity-50",
    focusRing,
    VARIANT[variant],
    SIZE[size],
    block && "w-full",
  );
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant,
  size,
  block,
  icon,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(buttonClasses(variant, size, block), className)}
      {...rest}
    >
      {loading ? <Spinner size={size === "xl" ? 22 : 16} label="Working" /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  block,
  icon,
  className,
  children,
  href,
  ...rest
}: CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const external = /^https?:/.test(href);
  const cls = cx(buttonClasses(variant, size, block), className);
  if (external) {
    return (
      <a href={href} className={cls} target="_blank" rel="noopener noreferrer" {...rest}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
