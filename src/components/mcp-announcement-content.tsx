"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRoundIcon } from "lucide-react";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { useFavorites } from "@/components/favorites/favorites-provider";
import { LogoMark } from "@/components/logo";
import { Scene } from "@/components/scene";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const EXAMPLES = [
  "Regarde mes favoris Sextant et dis-moi lesquels parlent de santé mentale.",
  "Cherche des articles récents et très cités sur le télétravail.",
  "Fais-moi la bibliographie APA de ma liste « Mémoire 2026 ».",
  "Qu'ai-je surligné sur ce sujet, et à quelle page ?",
];

/** Contenu de l'annonce MCP, chargé à la demande (seulement pour qui ne l'a pas encore vue). */
export default function McpAnnouncementContent({ onClose }: { onClose: () => void }) {
  const { enabled } = useFavorites();
  const [signIn, setSignIn] = useState(false);

  if (signIn) {
    return (
      <SignInDialog
        open
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
        intro="Connectez-vous, puis créez une clé dans «&nbsp;Mon compte&nbsp;», rubrique Assistants IA, pour brancher Sextant à Claude ou ChatGPT."
      />
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="overflow-hidden p-0 sm:p-0 sm:max-w-lg">
        <Illustration />
        <div className="flex flex-col gap-4 px-6 pb-6 pt-1">
          <div className="flex flex-col gap-2">
            <span className="w-fit rounded-full bg-tint px-2.5 py-0.5 text-xs font-semibold text-accent-brand">Nouveau</span>
            <DialogTitle className="title-display">Sextant, dans votre assistant IA</DialogTitle>
            <DialogDescription className="text-meta leading-relaxed text-muted-foreground">
              Branchez Sextant à Claude, ChatGPT ou tout assistant compatible MCP. Il peut alors chercher des articles vérifiés et lire
              vos favoris, listes, citations et notes, sans rien pouvoir modifier.
            </DialogDescription>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Demandez-lui par exemple :</p>
            <ul className="flex flex-col gap-1.5">
              {EXAMPLES.map((e) => (
                <li key={e} className="w-fit max-w-full rounded-2xl rounded-bl-sm bg-secondary px-3.5 py-2 text-sm leading-snug text-secondary-foreground">
                  «&nbsp;{e}&nbsp;»
                </li>
              ))}
            </ul>
          </div>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <KeyRoundIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            La connexion passe par une clé personnelle, que vous créez et révoquez à tout moment depuis «&nbsp;Mon compte&nbsp;».
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose}>Plus tard</Button>
            {enabled ? (
              <Link href="/compte#assistants" onClick={onClose} className={buttonVariants({ size: "lg" })}>
                Connecter mon assistant
              </Link>
            ) : (
              <Button size="lg" onClick={() => setSignIn(true)}>
                Se connecter pour l'activer
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Illustration : le sextant relié par un fil pointillé à une bulle de conversation. Immobile. */
function Illustration() {
  return (
    <Scene
      viewBox="0 0 480 160"
      className="h-36 items-center gap-2 px-5 sm:h-40 sm:gap-4 sm:px-8"
      art={
        <g className="fill-brand">
          <circle cx="60" cy="30" r="2.5" /><circle cx="110" cy="130" r="2" /><circle cx="420" cy="28" r="3" /><circle cx="450" cy="120" r="2" /><circle cx="250" cy="22" r="2" />
        </g>
      }
    >
      {/* le sextant */}
      <div className="relative flex size-16 shrink-0 items-center justify-center rounded-2xl bg-card ring-1 ring-brand/30 sm:size-20">
        <LogoMark className="size-11 text-foreground sm:size-14" />
      </div>
      {/* le fil MCP */}
      <svg viewBox="0 0 120 24" className="relative h-6 w-16 shrink-0 sm:w-28">
        <path d="M4 12h112" className="stroke-brand" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="2 8" />
        <circle cx="4" cy="12" r="4" className="fill-brand" />
        <circle cx="116" cy="12" r="4" className="fill-brand" />
      </svg>
      {/* l'assistant */}
      <div className="relative flex w-28 shrink-0 flex-col gap-1.5 rounded-2xl rounded-bl-sm bg-card p-3 ring-1 ring-brand/30 sm:w-32">
        <span className="h-1.5 w-16 rounded-full bg-brand" />
        <span className="h-1.5 w-20 rounded-full bg-brand/35 sm:w-24" />
        <span className="h-1.5 w-20 rounded-full bg-brand/35" />
        <span className="h-1.5 w-12 rounded-full bg-brand/35" />
      </div>
    </Scene>
  );
}
