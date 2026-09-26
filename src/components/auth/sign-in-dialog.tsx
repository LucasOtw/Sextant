"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GoogleButton } from "@/components/auth/google-button";
import { GooglePopupCancelled, useFirebaseAuthPreload, withGooglePopup } from "@/components/auth/google-popup";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/components/auth/session-provider";
import type { ClientUser } from "@/lib/session-shared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Texte d'explication contextuel (ex. depuis un cœur de favori). */
  intro?: string;
  /** Appelé juste avant de lancer la connexion Google (ex. mémoriser l'article à enregistrer). */
  onBeforeSignIn?: () => void;
  /** Appelé après une connexion réussie, juste avant la fermeture et le rafraîchissement de la page. */
  onSuccess?: () => void;
}

/**
 * Après Google, on échange le jeton contre un cookie de session côté serveur ; la réponse porte l'identité, que
 * l'en-tête affiche aussitôt (SessionProvider), puis on rafraîchit les composants serveur.
 */
async function establishSession(idToken: string): Promise<ClientUser> {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const data = (await res.json().catch(() => ({}))) as { user?: ClientUser };
  if (!res.ok || !data.user) throw new Error("La session n'a pas pu être ouverte.");
  return data.user;
}

export function SignInDialog({ open, onOpenChange, intro, onBeforeSignIn, onSuccess }: Props) {
  const router = useRouter();
  const { signedIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  // Le SDK Firebase Auth n'est téléchargé et initialisé qu'à l'ouverture de cette fenêtre, jamais au chargement d'une
  // page : un visiteur qui ne se connecte pas ne télécharge pas le SDK et ne contacte pas Google (iframe
  // d'authentification, base IndexedDB). Sur mobile et Safari, `getAuth()` précharge alors l'iframe pendant que la
  // fenêtre s'affiche, pour que `signInWithPopup` ouvre la fenêtre Google dans la foulée du clic (sinon le bloqueur de
  // fenêtres surgissantes l'arrêterait). Le bouton reste occupé jusqu'à ce que le SDK soit prêt.
  const ready = useFirebaseAuthPreload(open);

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    onBeforeSignIn?.();
    try {
      // L'état Firebase du navigateur est vidé juste après l'échange, réussi ou non (SEC-12) : seul le cookie compte.
      const { credential, user } = await withGooglePopup(async (idToken, cred) => ({ credential: cred, user: await establishSession(idToken) }));
      signedIn(user);
      onSuccess?.();
      onOpenChange(false);
      toast.success(`Bienvenue${credential.user.displayName ? `, ${credential.user.displayName.split(" ")[0]}` : ""} !`, {
        description: "Vous êtes connecté. Vos favoris vous suivront d'un appareil à l'autre.",
      });
      router.refresh();
    } catch (e) {
      if (e instanceof GooglePopupCancelled) return;
      setError(e instanceof Error ? e.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle className="title-display text-2xl">Se connecter</DialogTitle>
        <DialogDescription className="text-[15px] leading-relaxed text-muted-foreground">
          {intro ?? "Un compte sert à retrouver vos favoris et vos listes d'un appareil à l'autre. La recherche reste libre sans compte."}
        </DialogDescription>
        <GoogleButton className="mt-2" onClick={signInWithGoogle} busy={busy || !ready} aria-describedby={error ? errorId : undefined} />
        {error && (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Nous recevons votre nom, votre e-mail et votre photo de profil Google, rien d'autre. Détails dans la politique de confidentialité.
        </p>
      </DialogContent>
    </Dialog>
  );
}
