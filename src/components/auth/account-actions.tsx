"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { toast } from "sonner";
import { Loader2Icon, LogOutIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { firebaseAuth } from "@/lib/firebase/client";
import { useLogout } from "@/components/auth/use-logout";

/** Déconnexion et suppression du compte, depuis la page « Mon compte ». */
export function AccountActions() {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { logout, pending } = useLogout("/");

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/account", { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "La suppression a échoué.");
      setBusy(false);
      return;
    }
    try {
      await signOut(firebaseAuth());
    } catch {
      /* rien */
    }
    toast.success("Compte supprimé.", { description: "Votre profil et vos données ont été effacés." });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={logout} disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : <LogOutIcon />} Se déconnecter
      </Button>
      <Button variant="destructive" onClick={() => setConfirm(true)}>
        <Trash2Icon /> Supprimer mon compte
      </Button>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle className="title-display text-2xl">Supprimer votre compte ?</DialogTitle>
          <DialogDescription className="text-[15px] leading-relaxed text-muted-foreground">
            Votre compte et toutes les données qui lui sont liées seront effacés immédiatement. Cette action est définitive.
          </DialogDescription>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(false)} disabled={busy}>Annuler</Button>
            <Button variant="destructive" onClick={deleteAccount} disabled={busy}>
              {busy && <Loader2Icon className="animate-spin" />} Supprimer définitivement
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
