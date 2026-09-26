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
        "relative inline-flex size-9 items-center justify-center rounded-full transition-colors hover:bg-muted hover:text-foreground",
        current ? "bg-muted text-foreground" : "text-muted-foreground",
        pending && "hidden [[data-session]_&]:inline-flex",
        className,
      )}
    >
      <BookmarkIcon className="size-4" aria-hidden />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-brand px-1 text-[10px] font-semibold text-accent-brand-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
