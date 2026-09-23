"use client";

import Link from "next/link";
import { BookmarkIcon } from "lucide-react";
import { useFavorites } from "@/components/favorites/favorites-provider";
import { cn } from "cn";

/** Lien « Mes favoris » du header, avec le compteur, visible connecté. */
export function FavoritesLink({ className }: { className?: string }) {
  const { enabled, count } = useFavorites();
  if (!enabled) return null;
  return (
    <Link
      href="/favoris"
      aria-label={`Mes favoris${count ? `, ${count}` : ""}`}
      className={cn(
        "relative inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
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
