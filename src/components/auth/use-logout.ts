"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { purgeStoredFirebaseAuth } from "@/components/auth/google-popup";

/**
 * Déconnexion partagée (menu du header, page « Mon compte »). Le succès n'est annoncé que si le serveur a bien
 * effacé le cookie de session : sinon l'utilisateur, toujours connecté, doit le savoir et pouvoir réessayer.
 */
export function useLogout(redirectTo?: string) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const logout = useCallback(async () => {
    setPending(true);
    let ok = false;
    try {
      ok = (await fetch("/api/auth/session", { method: "DELETE" })).ok;
    } catch {
      /* réseau indisponible : traité comme un échec */
    }
    // Aucun utilisateur Firebase ne reste dans le navigateur depuis SEC-12 (withGooglePopup le vide) : pas de signOut,
    // qui chargerait le SDK et recréerait la base IndexedDB. Seule la purge de l'état laissé par les anciennes versions.
    purgeStoredFirebaseAuth();
    setPending(false);
    if (!ok) {
      toast.error("La déconnexion a échoué.", { description: "Vérifiez votre connexion puis réessayez." });
      return;
    }
    toast("Vous êtes déconnecté.", { description: "À bientôt sur Sextant." });
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }, [redirectTo, router]);

  return { logout, pending };
}
