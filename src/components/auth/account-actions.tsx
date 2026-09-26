"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon, LogOutIcon, MonitorSmartphoneIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useLogout } from "@/components/auth/use-logout";
import { needsReauth, ReauthDialog } from "@/components/auth/reauth";
import { purgeStoredFirebaseAuth } from "@/components/auth/google-popup";
import { useSession } from "@/components/auth/session-provider";

/** Déconnexion (cet appareil ou tous), et suppression du compte, depuis la page « Mon compte ». */
export function AccountActions() {
  const router = useRouter();
  const { signedOut } = useSession();
  const [confirm, setConfirm] = useState(false);
  const [reauth, setReauth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busyAll, setBusyAll] = useState(false);
  const [errorAll, setErrorAll] = useState<string | null>(null);
  const { logout, pending } = useLogout("/");
  const errorId = useId();
  const errorAllId = useId();

  async function deleteAccount() {
    // Fenêtre de confirmation (r)ouverte en état occupé : après la ré-authentification, la suppression rejouée prend
    // plusieurs secondes et ne doit ni passer inaperçue ni pouvoir être relancée en parallèle.
    setConfirm(true);
    setBusy(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch("/api/auth/account", { method: "DELETE" });
    } catch {
      setError("Connexion impossible, réessayez.");
      setBusy(false);
      return;
    }
    // Connexion Google trop ancienne (SEC-09) : confirmation d'identité, puis la suppression est rejouée.
    if (await needsReauth(res)) {
      setBusy(false);
      setConfirm(false);
      setReauth(true);
      return;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "La suppression a échoué.");
      setConfirm(true);
      setBusy(false);
      return;
    }
    // Fenêtre laissée en état occupé jusqu'au départ de la page : rien à relancer.
    purgeStoredFirebaseAuth();
    signedOut();
    toast.success("Compte supprimé.", { description: "Votre profil et vos données ont été effacés." });
    router.push("/");
    router.refresh();
  }

  /** Révoque toutes les sessions et les clés MCP (SEC-08) : pour un appareil perdu ou une session qu'on ne reconnaît pas. */
  async function logoutEverywhere() {
    setBusyAll(true);
    setErrorAll(null);
    let res: Response;
    try {
      res = await fetch("/api/auth/sessions", { method: "DELETE" });
    } catch {
      setErrorAll("Connexion impossible, réessayez.");
      setBusyAll(false);
      return;
    }
    if (res.status === 401) {
      // Session déjà expirée ou révoquée : rien à couper depuis ici, il faut se reconnecter.
      setErrorAll("Votre session a déjà expiré : reconnectez-vous.");
      setBusyAll(false);
      signedOut();
      router.refresh();
      return;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setErrorAll(data.error ?? "La déconnexion des autres appareils a échoué, réessayez.");
      setBusyAll(false);
      return;
    }
    // Sessions révoquées ; `keysPending` : la suppression des clés a échoué (elles sont déjà refusées) et se termine en différé.
    const data = (await res.json().catch(() => ({}))) as { keysPending?: boolean };
    setConfirmAll(false);
    signedOut();
    if (data.keysPending) {
      toast.warning("Vous êtes déconnecté de tous vos appareils.", {
        description: "Vos clés d'assistant IA ne fonctionnent plus, mais n'ont pas toutes pu être effacées. Vérifiez leur liste après vous être reconnecté.",
      });
    } else {
      toast("Vous êtes déconnecté de tous vos appareils.", { description: "Vos clés d'assistant IA ont été révoquées." });
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={logout} disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : <LogOutIcon />} Se déconnecter
      </Button>
      <Button variant="outline" onClick={() => setConfirmAll(true)}>
        <MonitorSmartphoneIcon /> Se déconnecter de tous les appareils
      </Button>
      <Button variant="destructive" onClick={() => setConfirm(true)} disabled={busy}>
        <Trash2Icon /> Supprimer mon compte
      </Button>

      <Dialog open={confirmAll} onOpenChange={(o) => !busyAll && setConfirmAll(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle className="title-display text-2xl">Se déconnecter partout ?</DialogTitle>
          <DialogDescription className="text-[15px] leading-relaxed text-muted-foreground">
            Toutes vos sessions seront fermées, sur cet appareil aussitôt et sur les autres dans les 5 minutes, et vos clés d'assistant IA seront révoquées :
            il faudra en créer de nouvelles. À utiliser si un appareil a été perdu ou si une session vous semble suspecte.
          </DialogDescription>
          {errorAll && (
            <p id={errorAllId} role="alert" className="text-sm text-destructive">
              {errorAll}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmAll(false)} disabled={busyAll}>Annuler</Button>
            <Button onClick={() => void logoutEverywhere()} disabled={busyAll} aria-describedby={errorAll ? errorAllId : undefined}>
              {busyAll && <Loader2Icon className="animate-spin" />} Tout déconnecter
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirm} onOpenChange={(o) => !busy && setConfirm(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle className="title-display text-2xl">Supprimer votre compte ?</DialogTitle>
          <DialogDescription className="text-[15px] leading-relaxed text-muted-foreground">
            Votre compte et toutes les données qui lui sont liées seront effacés immédiatement. Cette action est définitive.
          </DialogDescription>
          {error && (
            <p id={errorId} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(false)} disabled={busy}>Annuler</Button>
            <Button variant="destructive" onClick={() => void deleteAccount()} disabled={busy} aria-describedby={error ? errorId : undefined}>
              {busy && <Loader2Icon className="animate-spin" />} Supprimer définitivement
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ReauthDialog
        open={reauth}
        onOpenChange={setReauth}
        description="Par sécurité, la suppression du compte demande une connexion Google récente. Confirmez, et la suppression se fera aussitôt."
        onConfirmed={() => void deleteAccount()}
      />
    </div>
  );
}
