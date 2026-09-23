"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { LogOutIcon, UserRoundIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { firebaseAuth } from "@/lib/firebase/client";
import type { SessionUser } from "@/lib/auth";
import { completeRedirectSignIn, SignInDialog } from "@/components/auth/sign-in-dialog";

interface Props {
  user: SessionUser | null;
}

/** Bouton du header : « Se connecter » ou avatar avec menu. L'état vient du serveur (cookie de session). */
export function AuthButton({ user }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Si l'utilisateur revient d'une connexion par redirection, on termine l'ouverture de session.
  useEffect(() => {
    if (user) return;
    completeRedirectSignIn().then((done) => done && router.refresh());
  }, [user, router]);

  async function logout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    try {
      await signOut(firebaseAuth());
    } catch {
      /* Firebase non initialisé : rien à faire */
    }
    router.refresh();
  }

  if (!user) {
    return (
      <>
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => setOpen(true)}>
          <UserRoundIcon /> Se connecter
        </Button>
        <SignInDialog open={open} onOpenChange={setOpen} />
      </>
    );
  }

  const initials = (user.name ?? user.email ?? "?").split(/[\s@]+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Mon compte"
        render={<Button variant="ghost" size="icon" className="rounded-full" />}
      >
        <Avatar className="size-8">
          {user.picture && <AvatarImage src={user.picture} alt="" referrerPolicy="no-referrer" />}
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate font-medium text-foreground">{user.name ?? "Mon compte"}</span>
          {user.email && <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/compte" />}>
          <UserRoundIcon /> Mon compte
        </DropdownMenuItem>
        <DropdownMenuItem onClick={logout}>
          <LogOutIcon /> Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
