import Link from "next/link";
import { Mascot } from "@/components/art/Mascot";

const COLUMNS = [
  {
    heading: "Learn",
    links: [
      { href: "/#program", label: "Her curriculum" },
      { href: "/learn", label: "Open the studio" },
      { href: "/#how", label: "How it works" },
    ],
  },
  {
    heading: "Families",
    links: [
      { href: "/sign-in", label: "Parent sign in" },
      { href: "/#families", label: "Safety & privacy" },
      { href: "/parent", label: "Parent dashboard" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-ink text-paper">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5">
            <Mascot size={36} mood="wave" />
            <span className="font-display text-lg font-semibold">Kaelyn&rsquo;s Academy</span>
          </div>
          <p className="mt-4 max-w-sm text-paper/70">
            A warm learning studio for young children. Built by one family, on our own
            hardware, with care.
          </p>
          <p className="mt-4 text-sm text-paper/55">
            No ads. No tracking on children. Your child&rsquo;s data stays yours, and you can
            export or delete it any time.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.heading} aria-label={col.heading}>
            <h2 className="font-display text-base font-semibold text-paper/90">{col.heading}</h2>
            <ul className="mt-3 space-y-2">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-paper/70 transition-colors hover:text-paper">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-paper/15">
        <div className="mx-auto max-w-6xl px-5 py-5 text-sm text-paper/55">
          © {new Date().getFullYear()} Kaelyn&rsquo;s Academy · Made with care at home.
        </div>
      </div>
    </footer>
  );
}
