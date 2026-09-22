"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

export function HeaderNav() {
  const pathname = usePathname();
  const active = pathname.startsWith("/search");
  return (
    <nav aria-label="Navigation principale">
      <Link
        href="/search"
        aria-current={active ? "page" : undefined}
        className={cn(
          "rounded-full px-3.5 py-1.5 text-[15px] transition-colors duration-200",
          active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        Recherche
      </Link>
    </nav>
  );
}
