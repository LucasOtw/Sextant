"use client";

import { useEffect, useRef, useState } from "react";
import { HeartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { useFavorites } from "@/components/favorites/favorites-provider";
import { clearPendingFavorite, writePendingFavorite } from "@/components/favorites/pending-favorite";
import type { FavoriteSnapshot } from "@/lib/favorites-shared";
import { favoriteLabel } from "@/lib/labels";
import { cn } from "@/lib/cn";

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
 * où l'utilisateur lance la connexion et enregistré dès que la session est ouverte par la fenêtre de connexion Google.
 */
export function FavoriteButton({ snapshot, variant = "icon", initialActive = false, className }: Props) {
  const favorites = useFavorites();
  const [signIn, setSignIn] = useState(false);
  const [pending, setPending] = useState(false);
  /** Vrai quand la fenêtre se ferme parce que la connexion a réussi : l'intention doit survivre. */
  const succeeded = useRef(false);
  // Avant les favoris du client : l'état du serveur de la page, aussi pendant que la session se détermine (PERF-01).
  const active = favorites.ready ? favorites.has(snapshot.id) : favorites.enabled || favorites.pending ? initialActive : false;

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
      // En couleurs forcées, le SVG garde sa couleur d'auteur : on le rend au système (ButtonText), le remplissage
      // restant le seul repère de l'état enregistré dans ce mode.
      className={cn(
        "size-[18px] transition-transform forced-colors:text-[color:ButtonText]",
        active ? "fill-favorite text-favorite forced-colors:fill-[ButtonText]" : "text-muted-foreground",
        pending && "scale-90",
      )}
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
          // Nom qui cite l'article (A11Y-23) ; la clé retrouve le cœur de la carte voisine quand celle-ci disparaît (A11Y-19).
          aria-label={favoriteLabel(snapshot.title)}
          data-focus-key="favorite"
          title={active ? "Retirer des favoris" : "Enregistrer dans mes favoris"}
          className={cn("bg-card/80 hover:bg-accent sm:size-9", className)}
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
