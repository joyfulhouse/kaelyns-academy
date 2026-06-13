import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "honey" | "accent" | "soft" | "ghost";
export type ButtonSize = "sm" | "md" | "lg" | "kid";

/** bg + text per variant (contrast-safe: light fills carry ink, deep fills carry on-accent) */
const FILL: Record<ButtonVariant, string> = {
  primary: "bg-coral-deep text-on-accent",
  honey: "bg-honey text-ink",
  accent: "bg-accent-deep text-on-accent",
  soft: "bg-paper-raised text-ink",
  ghost: "bg-transparent text-ink",
};

/** rest + hover elevation for non-kid sizes (hover never lightens a fill that carries white text) */
const ELEVATION: Record<ButtonVariant, string> = {
  primary: "shadow-md hover:-translate-y-0.5 hover:shadow-lg",
  honey: "shadow-md hover:-translate-y-0.5 hover:shadow-lg",
  accent: "shadow-md hover:-translate-y-0.5 hover:shadow-lg",
  soft: "border-2 border-ink/15 shadow-sm hover:border-ink/30 hover:shadow-md",
  ghost: "hover:bg-paper-raised",
};

const SIZE: Record<Exclude<ButtonSize, "kid">, string> = {
  sm: "min-h-9 gap-1.5 rounded-pill px-3.5 py-1.5 text-sm active:translate-y-px",
  md: "min-h-11 rounded-pill px-5 py-2.5 text-base active:translate-y-0.5",
  lg: "min-h-13 rounded-pill px-7 py-3.5 text-lg active:translate-y-0.5",
};

/** Kid treatment: storybook ink outline + flat "sticker" shadow that presses in. */
const KID =
  "min-h-16 rounded-2xl border-[3px] border-ink px-8 py-5 text-xl font-bold " +
  "shadow-pop hover:-translate-y-0.5 active:translate-y-1 active:shadow-none";

const BASE =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap " +
  "font-semibold transition duration-200 ease-out-quart " +
  "disabled:pointer-events-none disabled:opacity-50";

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof CommonProps> & { href?: undefined };

type ButtonAsLink = CommonProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, keyof CommonProps> & { href: string };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(
    BASE,
    FILL[variant],
    size === "kid" ? cn(FILL[variant], KID) : cn(ELEVATION[variant], SIZE[size]),
    className,
  );

  if ("href" in props && props.href !== undefined) {
    return (
      <Link className={classes} {...(props as ButtonAsLink)}>
        {children}
      </Link>
    );
  }

  const { type, ...rest } = props as ButtonAsButton;
  return (
    <button type={type ?? "button"} className={classes} {...rest}>
      {children}
    </button>
  );
}
