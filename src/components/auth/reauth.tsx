"use client";

import { useEffect, useState } from "react";
import { GoogleButton } from "@/components/auth/google-button";
import { GooglePopupCancelled, loadFirebaseAuth, withGooglePopup } from "@/components/auth/google-popup";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { REAUTH_REQUIRED } from "@/lib/reauth-shared";

/** La réponse exige-t-elle une connexion Google récente (401 `reauth_required`, SEC-09) ? Lit une copie du corps. */
export async function needsReauth(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  const data = (await res.clone().json().catch(() => null)) as { code?: unknown } | null;
  return data?.code === REAUTH_REQUIRED;
}

/** Nouvelle connexion Google avec le compte de la session (le serveur refuse un autre compte), qui rafraîchit le cookie. */
async function reauthenticate(): Promise<void> {
  await withGooglePopup(async (idToken) => {
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken, reauth: true }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "La confirmation a échoué, réessayez.");
    }
  });
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ce que la confirmation autorise (« supprimer votre compte », « créer une clé »…). */
  description: string;
  /** Appelé une fois l'identité confirmée : l'action est alors rejouée. */
  onConfirmed: () => void;
}

/**
 * Fenêtre « Confirmez votre identité » : une opération sensible exige une connexion Google de moins de 10 minutes.
 * Le bouton ouvre la fenêtre Google dans le prolongement du clic (une ouverture automatique après une requête serait
 * arrêtée par le bloqueur de fenêtres surgissantes).
 */
export function ReauthDialog({ open, onOpenChange, description, onConfirmed }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Comme la fenêtre de connexion : SDK et iframe préparés pendant l'affichage, pour Safari et le mobile.
  useEffect(() => {
    if (!open || !isFirebaseConfigured) return;
    // Échec (réseau, configuration absente) : l'erreur s'affichera au clic, qui réessaie.
    loadFirebaseAuth().catch(() => undefined);
  }, [open]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await reauthenticate();
      onOpenChange(false);
      onConfirmed();
    } catch (e) {
      if (!(e instanceof GooglePopupCancelled)) setError(e instanceof Error ? e.message : "La confirmation a échoué, réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle className="title-display text-2xl">Confirmez votre identité</DialogTitle>
        <DialogDescription className="text-[15px] leading-relaxed text-muted-foreground">{description}</DialogDescription>
        <GoogleButton className="mt-2" onClick={() => void confirm()} busy={busy}>
          Confirmer avec Google
        </GoogleButton>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">Choisissez le même compte Google que celui de votre session.</p>
      </DialogContent>
    </Dialog>
  );
}
