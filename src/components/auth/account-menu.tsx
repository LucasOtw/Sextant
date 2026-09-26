"use client";

import { useEffect } from "react";
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
import { useLogout } from "@/components/auth/use-logout";
import { purgeStoredFirebaseAuth } from "@/components/auth/google-popup";

/**
 * Avatar et menu du compte (utilisateur connecté). Chargé à la demande par AuthButton : Base UI Menu et le
 * positionnement flottant ne sont ainsi jamais téléchargés par un visiteur anonyme.
 */
export default function AccountMenu({ user }: { user: SessionUser }) {
  const { logout } = useLogout();
  // Session ouverte avant SEC-12 : l'état Firebase resté dans le navigateur est effacé (le cookie seul suffit).
  useEffect(() => purgeStoredFirebaseAuth(), []);
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
