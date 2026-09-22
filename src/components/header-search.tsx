"use client";

import { usePathname } from "next/navigation";
import { SearchBox } from "@/components/search-box";

/** Recherche du header — masquée sur les pages qui ont déjà la leur (accueil, résultats, thématiques). */
export function HeaderSearch() {
  const pathname = usePathname();
  if (pathname === "/" || pathname.startsWith("/search") || pathname.startsWith("/theme/")) return null;
  return (
    <div className="hidden w-full max-w-md md:block">
      <SearchBox size="compact" />
    </div>
  );
}
