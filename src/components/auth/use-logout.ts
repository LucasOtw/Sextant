"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { toast } from "sonner";
import { firebaseAuth } from "@/lib/firebase/client";

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
    // Nettoyage local du SDK client dans tous les cas : il ne peut pas rouvrir de session seul
    // (le serveur exige une connexion Google de moins de 5 minutes).
    try {
      await signOut(firebaseAuth());
    } catch {
      /* Firebase non initialisé : rien à faire */
    }
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
