"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getRedirectResult, signInWithPopup, signInWithRedirect } from "firebase/auth";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { firebaseAuth, googleProvider } from "@/lib/firebase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function SignInDialog({ open, onOpenChange }: Props) {
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
      onOpenChange(false);
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
          Un compte sert à retrouver vos favoris et vos collections d'un appareil à l'autre. La recherche reste libre sans compte.
        </DialogDescription>
        <Button size="lg" className="mt-2 w-full" onClick={signInWithGoogle} disabled={busy}>
          {busy ? <Loader2Icon className="animate-spin" /> : <GoogleMark />}
          Continuer avec Google
        </Button>
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
    return true;
  } catch {
    return false;
  }
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.3 0-5.9-2.7-5.9-6s2.6-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}
