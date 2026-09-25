"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { UserRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { useSession } from "@/components/auth/session-provider";
import { cn } from "cn";

// Jamais téléchargé par un anonyme (PERF-03) ; préchargé dès que l'indice de connexion est lu (voir plus bas).
const loadAccountMenu = () => import("@/components/auth/account-menu");
const AccountMenu = dynamic(loadAccountMenu);

/** Place de l'avatar, tant que l'identité ou le menu arrivent. */
function AvatarPlaceholder({ className }: { className?: string }) {
  return <span className={cn("size-8 shrink-0 rounded-full bg-muted", className)} aria-hidden />;
}

/**
 * Bouton du header : « Se connecter » ou avatar avec menu. L'état vient du navigateur (SessionProvider), pas du rendu
 * serveur : les pages sont en cache, identiques pour tous (PERF-01). Avant l'hydratation, le script d'avant rendu a
 * marqué <html data-session> chez un connecté : le CSS montre alors la place de l'avatar, sinon « Se connecter », sans
 * clignotement dans un sens ou dans l'autre.
 */
export function AuthButton() {
  const { status, user } = useSession();
  const [open, setOpen] = useState(false);

  // Connecté : le menu se télécharge pendant que l'identité arrive (GET /api/favorites).
  useEffect(() => {
    if (status === "signed-in") void loadAccountMenu();
  }, [status]);

  if (status === "signed-in") {
    if (!user) return <AvatarPlaceholder />;
    return (
      <Suspense fallback={<AvatarPlaceholder />}>
        <AccountMenu user={user} />
      </Suspense>
    );
  }

  const unknown = status === "unknown";
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn("rounded-full max-sm:size-8 max-sm:px-0", unknown && "[[data-session]_&]:hidden")}
        onClick={() => setOpen(true)}
      >
        {/* Icône seule sous sm (bouton carré) ; le libellé reste le nom accessible. */}
        <UserRoundIcon aria-hidden />
        <span className="sr-only sm:not-sr-only">Se connecter</span>
      </Button>
      {unknown && <AvatarPlaceholder className="hidden [[data-session]_&]:block" />}
      <SignInDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
