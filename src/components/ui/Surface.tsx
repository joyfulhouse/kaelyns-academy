import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SurfaceTone = "paper" | "raised" | "sunk" | "accent-tint";

const TONE: Record<SurfaceTone, string> = {
  paper: "bg-paper",
  raised: "bg-paper-raised shadow-md",
  sunk: "bg-paper-sunk",
  "accent-tint": "bg-accent/10",
};

type SurfaceProps<E extends ElementType> = {
  as?: E;
  tone?: SurfaceTone;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<E>, "as" | "tone" | "className" | "children">;

/** The *rare* card/panel. Never nest a Surface inside a Surface (DESIGN.md §5). */
export function Surface<E extends ElementType = "div">({
  as,
  tone = "raised",
  className,
  children,
  ...rest
}: SurfaceProps<E>) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag className={cn("rounded-xl", TONE[tone], className)} {...rest}>
      {children}
    </Tag>
  );
}
