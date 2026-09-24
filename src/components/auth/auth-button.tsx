"use client";

import { Suspense, useState } from "react";
import dynamic from "next/dynamic";
import { UserRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth";
import { SignInDialog } from "@/components/auth/sign-in-dialog";

// Rendu côté serveur et préchargé pour un connecté ; jamais téléchargé par un anonyme (PERF-03).
const AccountMenu = dynamic(() => import("@/components/auth/account-menu"));

interface Props {
  user: SessionUser | null;
}

/** Bouton du header : « Se connecter » ou avatar avec menu. L'état vient du serveur (cookie de session). */
export function AuthButton({ user }: Props) {
  const [open, setOpen] = useState(false);

  if (!user) {
    return (
      <>
        <Button variant="outline" size="sm" className="rounded-full max-sm:size-8 max-sm:px-0" onClick={() => setOpen(true)}>
          {/* Icône seule sous sm (bouton carré) ; le libellé reste le nom accessible. */}
          <UserRoundIcon aria-hidden />
          <span className="sr-only sm:not-sr-only">Se connecter</span>
        </Button>
        <SignInDialog open={open} onOpenChange={setOpen} />
      </>
    );
  }

  // Juste après une connexion, le menu arrive par le réseau : on réserve la place de l'avatar en attendant.
  return (
    <Suspense fallback={<span className="size-8 shrink-0 rounded-full bg-muted" aria-hidden />}>
      <AccountMenu user={user} />
    </Suspense>
  );
}
