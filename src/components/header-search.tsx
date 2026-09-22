"use client";

import { usePathname } from "next/navigation";
import { SearchBox } from "@/components/search-box";

/** Recherche du header — masquée sur l'accueil, qui a déjà la sienne. */
export function HeaderSearch() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <div className="ml-auto hidden w-full max-w-lg md:block">
      <SearchBox size="compact" />
    </div>
  );
}
