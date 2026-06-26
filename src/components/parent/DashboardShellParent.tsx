"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  HouseIcon,
  UsersThreeIcon,
  GearSixIcon,
  SignOutIcon,
  SpinnerGapIcon,
  StorefrontIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Mascot } from "@/components/art/Mascot";
import { SkipLink, MAIN_CONTENT_ID } from "@/components/a11y/SkipLink";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import type { PhosphorIcon } from "@/components/parent/icon";

interface NavItem {
  href: string;
  label: string;
  icon: PhosphorIcon;
}

const NAV: NavItem[] = [
  { href: "/parent", label: "Home", icon: HouseIcon },
  { href: "/parent/learners", label: "Learners", icon: UsersThreeIcon },
  { href: "/parent/curriculum", label: "Curriculum", icon: StorefrontIcon },
  { href: "/parent/settings", label: "Settings", icon: GearSixIcon },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/parent") return pathname === "/parent";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SignOutButton({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-ink-soft transition-colors",
        "hover:bg-paper-sunk hover:text-ink disabled:pointer-events-none disabled:opacity-50",
        compact ? "" : "w-full",
      )}
    >
      {pending ? (
        <SpinnerGapIcon weight="bold" className="size-5 motion-safe:animate-spin" />
      ) : (
        <SignOutIcon weight="regular" className="size-5" />
      )}
      <span className={compact ? "sr-only" : ""}>Sign out</span>
    </button>
  );
}

/**
 * Parent surface frame (DESIGN.md §6, `.surface-parent`): a calm sidebar on
 * desktop, a top bar on mobile. Paper + ink + hairline borders, regular-weight
 * icons, one accent. Real navigation, real sign-out.
 */
export function DashboardShellParent({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="surface-parent relative min-h-dvh bg-paper">
      <SkipLink />
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur-[2px] lg:hidden">
        <div className="flex h-16 items-center gap-3 px-4">
          <Link href="/parent" className="flex items-center gap-2" aria-label="Parent home">
            <Mascot size={32} mood="happy" />
            <span className="font-display text-base font-semibold tracking-tight">
              Kaelyn&rsquo;s Academy
            </span>
          </Link>
          <div className="ml-auto">
            <SignOutButton compact />
          </div>
        </div>
        <nav aria-label="Parent" className="flex gap-1 overflow-x-auto px-2 pb-2">
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
          <Link
            href="/parent"
            className="flex items-center gap-2.5 px-2"
            aria-label="Parent home"
          >
            <Mascot size={36} mood="happy" />
            <span className="font-display text-lg font-semibold tracking-tight">
              Kaelyn&rsquo;s Academy
            </span>
          </Link>

          <nav aria-label="Parent" className="mt-8 flex flex-col gap-1">
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
            <SignOutButton />
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
