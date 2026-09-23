"use client";

import { useEffect, useRef, useState } from "react";
import { HeartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { clearPendingFavorite, useFavorites, writePendingFavorite } from "@/components/favorites/favorites-provider";
import type { FavoriteSnapshot } from "@/lib/favorites-shared";
import { cn } from "cn";

interface Props {
  snapshot: FavoriteSnapshot;
  /** `icon` : cœur seul (cartes) ; `button` : cœur + libellé (fiche article). */
  variant?: "icon" | "button";
  /** État connu côté serveur (page /favoris, fiche article) : évite un cœur vide pendant le premier chargement client. */
  initialActive?: boolean;
  className?: string;
}

/**
 * Cœur d'enregistrement. Sans compte, propose de se connecter ; l'article visé est mémorisé au moment
 * où l'utilisateur lance la connexion et enregistré dès que la session est ouverte (fenêtre ou redirection).
 */
export function FavoriteButton({ snapshot, variant = "icon", initialActive = false, className }: Props) {
  const favorites = useFavorites();
  const [signIn, setSignIn] = useState(false);
  const [pending, setPending] = useState(false);
  /** Vrai quand la fenêtre se ferme parce que la connexion a réussi : l'intention doit survivre. */
  const succeeded = useRef(false);
  const active = favorites.ready ? favorites.has(snapshot.id) : favorites.enabled ? initialActive : false;

  // Si l'utilisateur quitte la page pendant que la fenêtre est ouverte, on n'enregistre rien à son insu plus tard.
  useEffect(() => {
    return () => {
      if (!succeeded.current) clearPendingFavorite();
    };
  }, []);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    setPending(true);
    const result = await favorites.toggle(snapshot);
    setPending(false);
    if (result === "signin") {
      succeeded.current = false;
      setSignIn(true);
    }
  }

  const icon = (
    <HeartIcon
      className={cn("size-[18px] transition-transform", active ? "fill-rose-500 text-rose-500" : "text-muted-foreground", pending && "scale-90")}
      aria-hidden
    />
  );

  return (
    <>
      {variant === "icon" ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          aria-pressed={active}
          aria-label="Favori"
          title={active ? "Retirer des favoris" : "Enregistrer dans mes favoris"}
          className={cn("size-10 rounded-full bg-card/80 hover:bg-card sm:size-9", className)}
        >
          {icon}
        </Button>
      ) : (
        <Button variant={active ? "secondary" : "outline"} size="lg" onClick={onClick} className={className}>
          {icon}
          {active ? "Enregistré" : "Enregistrer"}
        </Button>
      )}
      {signIn && (
        <SignInDialog
          open={signIn}
          onOpenChange={(open) => {
            setSignIn(open);
            // Fermeture par abandon (croix, Échap, clic dehors) : on oublie l'intention.
            if (!open && !succeeded.current) clearPendingFavorite();
          }}
          intro="Connectez-vous pour enregistrer cet article et le retrouver sur tous vos appareils."
          onBeforeSignIn={() => writePendingFavorite(snapshot)}
          onSuccess={() => {
            succeeded.current = true;
          }}
        />
      )}
    </>
  );
}
