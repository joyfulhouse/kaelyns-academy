"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenIcon,
  HouseIcon,
  PencilRulerIcon,
} from "@phosphor-icons/react/dist/ssr";
import { SkipLink, MAIN_CONTENT_ID } from "@/components/a11y/SkipLink";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<
    React.SVGProps<SVGSVGElement> & {
      weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
    }
  >;
}

const NAV: NavItem[] = [
  { href: "/admin", label: "Programs", icon: BookOpenIcon },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Admin surface shell — calm/dense, mirrors the parent shell aesthetic
 * (.surface-parent). Sticky sidebar on desktop, top bar on mobile.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="surface-parent relative min-h-dvh bg-paper">
      <SkipLink />
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur-[2px] lg:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <span className="flex items-center gap-2">
            <PencilRulerIcon weight="regular" className="size-5 text-ink-soft" />
            <span className="font-display text-sm font-semibold tracking-tight">
              Kaelyn&rsquo;s Academy — Studio
            </span>
          </span>
          <div className="ml-auto">
            <Link
              href="/parent"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-paper-sunk hover:text-ink"
            >
              <HouseIcon weight="regular" className="size-4" />
              Parent view
            </Link>
          </div>
        </div>
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-2 pb-2">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-pill px-3.5 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent/15 text-ink"
                    : "text-ink-soft hover:bg-paper-sunk hover:text-ink",
                )}
              >
                <Icon weight={active ? "fill" : "regular"} className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="mx-auto flex max-w-7xl">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line px-4 py-6 lg:flex">
          <div className="flex items-center gap-2.5 px-2">
            <PencilRulerIcon weight="regular" className="size-6 text-ink-soft" />
            <span className="font-display text-base font-semibold tracking-tight">
              Studio
            </span>
          </div>

          <nav aria-label="Admin" className="mt-8 flex flex-col gap-1">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent/15 text-ink"
                      : "text-ink-soft hover:bg-paper-sunk hover:text-ink",
                  )}
                >
                  <Icon weight={active ? "fill" : "regular"} className="size-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-line pt-4">
            <Link
              href="/parent"
              className="inline-flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-paper-sunk hover:text-ink"
            >
              <HouseIcon weight="regular" className="size-5" />
              Back to parent view
            </Link>
          </div>
        </aside>

        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-12"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
