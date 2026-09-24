"use client";

import { useState } from "react";
import Link from "next/link";
import { BookmarkIcon, LogOutIcon, UserRoundIcon, HighlighterIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionUser } from "@/lib/auth";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { useLogout } from "@/components/auth/use-logout";

interface Props {
  user: SessionUser | null;
}

/** Bouton du header : « Se connecter » ou avatar avec menu. L'état vient du serveur (cookie de session). */
export function AuthButton({ user }: Props) {
  const [open, setOpen] = useState(false);
  const { logout } = useLogout();

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
        <DropdownMenuGroup>
          {/* L'identité mène à la page du compte. */}
          <DropdownMenuItem render={<Link href="/compte" />} className="flex-col items-start gap-0 py-1.5" aria-label="Mon compte">
            <span className="w-full truncate font-medium text-foreground">{user.name ?? "Mon compte"}</span>
            {user.email && <span className="w-full truncate text-xs font-normal text-muted-foreground">{user.email}</span>}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/favoris" />}>
            <BookmarkIcon /> Mes favoris
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/citations" />}>
            <HighlighterIcon /> Mes citations
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/compte" />}>
            <UserRoundIcon /> Mon compte
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={logout}>
            <LogOutIcon /> Se déconnecter
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
