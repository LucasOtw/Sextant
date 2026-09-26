"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookmarkIcon } from "lucide-react";
import { useFavorites } from "@/components/favorites/favorites-provider";
import { cn } from "cn";

/**
 * Lien « Mes favoris » du header, avec le compteur, visible connecté. Avant que la session soit connue (page en cache,
 * identique pour tous), il n'est montré que si le script d'avant rendu a marqué <html data-session> (PERF-01).
 */
export function FavoritesLink({ className }: { className?: string }) {
  const { enabled, pending, count } = useFavorites();
  const current = usePathname() === "/favoris";
  if (!enabled && !pending) return null;
  return (
    <Link
      href="/favoris"
      aria-label={`Mes favoris${count ? `, ${count}` : ""}`}
      aria-current={current ? "page" : undefined}
      className={cn(
        "relative inline-flex size-9 items-center justify-center rounded-full transition-colors hover:bg-accent hover:text-foreground",
        current ? "bg-muted text-foreground" : "text-muted-foreground",
        pending && "hidden [[data-session]_&]:inline-flex",
        className,
      )}
    >
      <BookmarkIcon className="size-4" aria-hidden />
      {/* Compteur en 12 px (seule exception au plancher de 13 px), Nunito 700 dans une pastille de 18 px. */}
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[0.75rem] leading-none font-bold tabular-nums text-primary-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
