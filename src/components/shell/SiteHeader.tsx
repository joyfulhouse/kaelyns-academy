import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Mascot } from "@/components/art/Mascot";

const NAV = [
  { href: "/#program", label: "The curriculum" },
  { href: "/#how", label: "How it works" },
  { href: "/#families", label: "For families" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/95 backdrop-blur-[2px]">
      <div className="mx-auto flex h-18 max-w-6xl items-center gap-6 px-5 py-3">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Kaelyn's Academy home">
          <Mascot size={38} mood="happy" />
          <span className="font-display text-xl font-semibold tracking-tight">
            Kaelyn&rsquo;s Academy
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-base font-medium text-ink-soft transition-colors hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Button href="/sign-in" variant="ghost" size="sm" className="hidden sm:inline-flex">
            Sign in
          </Button>
          <Button href="/learn" variant="primary" size="sm">
            Start exploring
          </Button>
        </div>
      </div>
    </header>
  );
}
