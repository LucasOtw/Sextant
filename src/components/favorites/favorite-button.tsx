"use client";

import { useState } from "react";
import { HeartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { useFavorites } from "@/components/favorites/favorites-provider";
import type { FavoriteSnapshot } from "@/lib/favorites-shared";
import { cn } from "cn";

interface Props {
  snapshot: FavoriteSnapshot;
  /** `icon` : cœur seul (cartes) ; `button` : cœur + libellé (fiche article). */
  variant?: "icon" | "button";
  className?: string;
}

/** Cœur d'enregistrement. Sans compte, propose de se connecter puis enregistre l'article visé. */
export function FavoriteButton({ snapshot, variant = "icon", className }: Props) {
  const favorites = useFavorites();
  const [signIn, setSignIn] = useState(false);
  const [pending, setPending] = useState(false);
  const active = favorites.has(snapshot.id);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    setPending(true);
    const result = await favorites.toggle(snapshot);
    setPending(false);
    if (result === "signin") setSignIn(true);
  }

  const label = active ? "Retirer des favoris" : "Enregistrer dans mes favoris";
  const icon = (
    <HeartIcon
      className={cn("transition-transform", active ? "fill-rose-500 text-rose-500" : "text-muted-foreground", pending && "scale-90")}
      aria-hidden
    />
  );

  return (
    <>
      {variant === "icon" ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClick}
          aria-pressed={active}
          aria-label={label}
          title={label}
          className={cn("rounded-full bg-card/80 hover:bg-card", className)}
        >
          {icon}
        </Button>
      ) : (
        <Button variant={active ? "secondary" : "outline"} size="lg" onClick={onClick} aria-pressed={active} className={className}>
          {icon}
          {active ? "Enregistré" : "Enregistrer"}
        </Button>
      )}
      {signIn && (
        <SignInDialog
          open={signIn}
          onOpenChange={setSignIn}
          intro="Connectez-vous pour enregistrer cet article et le retrouver sur tous vos appareils."
          onSuccess={() => {
            // Après connexion, on enregistre l'article que l'utilisateur voulait garder.
            void fetch("/api/favorites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(snapshot) })
              .then(() => favorites.refresh());
          }}
        />
      )}
    </>
  );
}
