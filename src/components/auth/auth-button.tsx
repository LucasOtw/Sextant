"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { UserRoundIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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
 * Identité toujours inconnue passé ce délai (le premier chargement répond d'ordinaire en moins d'une seconde) : panne
 * probable. La place de l'avatar devient un lien « Mon compte » vers /compte, qui donne accès à la déconnexion.
 */
const IDENTITY_STALLED_MS = 5_000;

function AccountFallback() {
  return (
    <Link href="/compte" className={buttonVariants({ variant: "outline", size: "sm", className: "rounded-full max-sm:size-8 max-sm:px-0" })}>
      <UserRoundIcon aria-hidden />
      <span className="sr-only sm:not-sr-only">Mon compte</span>
    </Link>
  );
}

/**
 * Bouton du header : « Se connecter » ou avatar avec menu. L'état vient du navigateur (SessionProvider), pas du rendu
 * serveur : les pages sont en cache, identiques pour tous (PERF-01). Avant l'hydratation, le script d'avant rendu a
 * marqué <html data-session> chez un connecté : le CSS montre alors la place de l'avatar, sinon « Se connecter », sans
 * clignotement dans un sens ou dans l'autre.
 */
export function AuthButton() {
  const { status, user, key } = useSession();
  const [open, setOpen] = useState(false);
  /** Session dont l'identité tarde (voir IDENTITY_STALLED_MS). */
  const [stalledKey, setStalledKey] = useState<string | null>(null);
  const waitingIdentity = status === "signed-in" && !user;

  useEffect(() => {
    if (!waitingIdentity) return;
    const timer = setTimeout(() => setStalledKey(key), IDENTITY_STALLED_MS);
    return () => clearTimeout(timer);
  }, [waitingIdentity, key]);

  // Connecté : le menu se télécharge pendant que l'identité arrive (GET /api/favorites).
  useEffect(() => {
    if (status === "signed-in") void loadAccountMenu();
  }, [status]);

  if (status === "signed-in") {
    // Sans identité, pas de menu : un lien accessible plutôt qu'un disque muet, une fois le délai normal passé.
    if (!user) return stalledKey === key ? <AccountFallback /> : <AvatarPlaceholder />;
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
