"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const LINKS = [
  { href: "/", label: "Accueil", match: (p: string) => p === "/" },
  { href: "/#themes", label: "Thématiques", match: (p: string) => p.startsWith("/theme/") },
  { href: "/search", label: "Recherche", match: (p: string) => p.startsWith("/search") || p.startsWith("/article/") },
];

export function HeaderNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1" aria-label="Navigation principale">
      {LINKS.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[15px] transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              l.href === "/" && "hidden sm:inline-flex",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
