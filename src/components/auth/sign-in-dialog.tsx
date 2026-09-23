"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getRedirectResult, signInWithPopup, signInWithRedirect } from "firebase/auth";
import { toast } from "sonner";
import { GoogleButton } from "@/components/auth/google-button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { firebaseAuth, googleProvider } from "@/lib/firebase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Texte d'explication contextuel (ex. depuis un cœur de favori). */
  intro?: string;
  /** Appelé après une connexion réussie, avant le rafraîchissement de la page. */
  onSuccess?: () => void;
  /** Ne pas signaler la fermeture comme un abandon quand la connexion a réussi (favori en attente). */
  keepPending?: boolean;
}

/** Après Google, on échange le jeton contre un cookie de session côté serveur, puis on rafraîchit les composants serveur. */
async function establishSession(idToken: string) {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error("La session n'a pas pu être ouverte.");
}

export function SignInDialog({ open, onOpenChange, intro, onSuccess, keepPending }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    try {
      const auth = firebaseAuth();
      let credential;
      try {
        credential = await signInWithPopup(auth, googleProvider());
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
          await signInWithRedirect(auth, googleProvider());
          return;
        }
        if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
          setBusy(false);
          return;
        }
        throw e;
      }
      await establishSession(await credential.user.getIdToken());
      if (!keepPending) onOpenChange(false);
      onSuccess?.();
      toast.success(`Bienvenue${credential.user.displayName ? `, ${credential.user.displayName.split(" ")[0]}` : ""} !`, {
        description: "Vous êtes connecté. Vos favoris vous suivront d'un appareil à l'autre.",
      });
      router.refresh();
    } catch (e) {
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
          {intro ?? "Un compte sert à retrouver vos favoris et vos collections d'un appareil à l'autre. La recherche reste libre sans compte."}
        </DialogDescription>
        <GoogleButton className="mt-2" onClick={signInWithGoogle} busy={busy} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          Nous recevons votre nom, votre e-mail et votre photo de profil Google, rien d'autre. Détails dans la politique de confidentialité.
        </p>
      </DialogContent>
    </Dialog>
  );
}

/** Reprend une connexion faite par redirection (repli quand la fenêtre surgissante est bloquée). */
export async function completeRedirectSignIn(): Promise<boolean> {
  try {
    const result = await getRedirectResult(firebaseAuth());
    if (!result) return false;
    await establishSession(await result.user.getIdToken());
    toast.success(`Bienvenue${result.user.displayName ? `, ${result.user.displayName.split(" ")[0]}` : ""} !`, {
      description: "Vous êtes connecté.",
    });
    return true;
  } catch {
    return false;
  }
}

