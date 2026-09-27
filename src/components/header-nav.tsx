"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { toggleChip } from "@/components/ui/toggle-chip";

export function HeaderNav() {
  const pathname = usePathname();
  const active = pathname.startsWith("/search");
  return (
    <nav aria-label="Navigation principale">
      <Link
        href="/search"
        prefetch={false}
        aria-current={active ? "page" : undefined}
        {...toggleChip({ active, appearance: "ghost", size: "nav" })}
      >
        Recherche
      </Link>
    </nav>
  );
}
