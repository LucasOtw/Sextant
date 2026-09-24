"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithPopup } from "firebase/auth";
import { toast } from "sonner";
import { GoogleButton } from "@/components/auth/google-button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { firebaseAuth, googleProvider, isFirebaseConfigured } from "@/lib/firebase/client";

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

/** Après Google, on échange le jeton contre un cookie de session côté serveur, puis on rafraîchit les composants serveur. */
async function establishSession(idToken: string) {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error("La session n'a pas pu être ouverte.");
}

export function SignInDialog({ open, onOpenChange, intro, onBeforeSignIn, onSuccess }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Firebase Auth n'est initialisé qu'à l'ouverture de cette fenêtre, jamais au chargement d'une page : un visiteur qui
  // ne se connecte pas ne contacte pas Google (iframe d'authentification, base IndexedDB). Sur mobile et Safari, `getAuth()`
  // précharge alors l'iframe pendant que la fenêtre s'affiche, pour que `signInWithPopup` ouvre la fenêtre Google
  // dans la foulée du clic (sinon le bloqueur de fenêtres surgissantes l'arrêterait).
  useEffect(() => {
    if (!open || !isFirebaseConfigured) return;
    try {
      firebaseAuth();
    } catch {
      /* configuration absente : l'erreur s'affichera au clic */
    }
  }, [open]);

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    onBeforeSignIn?.();
    try {
      const auth = firebaseAuth();
      let credential;
      try {
        credential = await signInWithPopup(auth, googleProvider());
      } catch (e) {
        const code = (e as { code?: string }).code;
        // Pas de repli par redirection : avec l'authDomain Firebase (autre domaine que le site), Safari 16.1+,
        // Firefox 109+ et Chrome sans cookies tiers ramènent l'utilisateur déconnecté, sans message. On explique plutôt.
        if (code === "auth/popup-blocked") {
          setError("Votre navigateur a bloqué la fenêtre de connexion Google. Autorisez les fenêtres surgissantes pour ce site, puis réessayez.");
          return;
        }
        if (code === "auth/operation-not-supported-in-this-environment") {
          setError("Ouvrez Sextant dans votre navigateur (Safari, Chrome…) pour vous connecter.");
          return;
        }
        if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
        throw e;
      }
      await establishSession(await credential.user.getIdToken());
      onSuccess?.();
      onOpenChange(false);
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
          {intro ?? "Un compte sert à retrouver vos favoris et vos listes d'un appareil à l'autre. La recherche reste libre sans compte."}
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
