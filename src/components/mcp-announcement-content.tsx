"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, KeyRoundIcon, SparklesIcon } from "lucide-react";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { useFavorites } from "@/components/favorites/favorites-provider";
import { LogoMark } from "@/components/logo";
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
        intro="Connectez-vous, puis créez une clé dans « Mon compte » → Assistants IA pour brancher Sextant à Claude ou ChatGPT."
      />
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
        <Illustration />
        <div className="flex flex-col gap-4 px-6 pb-6 pt-1">
          <div className="flex flex-col gap-2">
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-accent-brand/10 px-2.5 py-0.5 text-xs font-semibold text-accent-brand">
              <SparklesIcon className="size-3" aria-hidden /> Nouveau
            </span>
            <DialogTitle className="title-display text-2xl leading-tight">Sextant, dans votre assistant IA</DialogTitle>
            <DialogDescription className="text-[15px] leading-relaxed text-muted-foreground">
              Branchez Sextant à Claude, ChatGPT ou tout assistant compatible MCP. Il peut alors chercher des articles vérifiés et lire
              vos favoris, listes, citations et notes, sans rien pouvoir modifier.
            </DialogDescription>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Demandez-lui par exemple :</p>
            <ul className="flex flex-col gap-1.5">
              {EXAMPLES.map((e, i) => (
                <li
                  key={e}
                  className="w-fit max-w-full rounded-2xl rounded-bl-sm bg-secondary px-3.5 py-2 text-[14px] leading-snug text-secondary-foreground animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards duration-300 motion-reduce:animate-none"
                  style={{ animationDelay: `${150 + i * 90}ms` }}
                >
                  « {e} »
                </li>
              ))}
            </ul>
          </div>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <KeyRoundIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            La connexion passe par une clé personnelle, que vous créez et révoquez à tout moment depuis « Mon compte ».
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose}>Plus tard</Button>
            {enabled ? (
              <Link href="/compte#assistants" onClick={onClose} className={buttonVariants({ size: "lg" })}>
                Connecter mon assistant <ArrowRightIcon data-icon="inline-end" />
              </Link>
            ) : (
              <Button size="lg" onClick={() => setSignIn(true)}>
                Se connecter pour l'activer <ArrowRightIcon data-icon="inline-end" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Illustration : le sextant relié par un fil pointillé à une bulle de conversation. */
function Illustration() {
  return (
    <div className="relative flex h-36 items-center justify-center gap-2 overflow-hidden bg-[oklch(0.94_0.03_250)] px-5 sm:h-40 sm:gap-4 sm:px-8 dark:bg-[oklch(0.28_0.05_250)]">
      <svg viewBox="0 0 480 160" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <g fill="#E0A52D">
          <circle cx="60" cy="30" r="2.5" /><circle cx="110" cy="130" r="2" /><circle cx="420" cy="28" r="3" /><circle cx="450" cy="120" r="2" /><circle cx="250" cy="22" r="2" />
        </g>
        <path d="M0 140c50-9 100-9 150 0s100 9 150 0 100-9 150 0 30 5 30 5v15H0z" fill="#4F6FD8" fillOpacity="0.18" />
      </svg>
      {/* le sextant */}
      <div className="relative flex size-16 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-[#4F6FD8]/25 sm:size-20 dark:bg-[#1D1F2A]">
        <LogoMark className="size-11 text-[#1D1F2A] sm:size-14 dark:text-[#F7F5EF]" />
      </div>
      {/* le fil MCP */}
      <svg viewBox="0 0 120 24" className="relative h-6 w-16 shrink-0 sm:w-28" aria-hidden>
        <path d="M4 12h112" stroke="#4F6FD8" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2 8" className="motion-safe:animate-[mcp-flow_1.2s_linear_infinite]" />
        <circle cx="4" cy="12" r="4" fill="#4F6FD8" />
        <circle cx="116" cy="12" r="4" fill="#E0A52D" />
      </svg>
      {/* l'assistant */}
      <div className="relative flex w-28 shrink-0 flex-col gap-1.5 rounded-2xl rounded-bl-sm bg-white p-3 shadow-sm ring-1 ring-[#4F6FD8]/25 sm:w-32 dark:bg-[#1D1F2A]">
        <SparklesIcon className="absolute -right-2 -top-2 size-5 text-[#E0A52D]" aria-hidden />
        <span className="h-1.5 w-16 rounded-full bg-[#4F6FD8]" />
        <span className="h-1.5 w-20 rounded-full bg-[#B8C4EE] sm:w-24" />
        <span className="h-1.5 w-20 rounded-full bg-[#B8C4EE]" />
        <span className="h-1.5 w-12 rounded-full bg-[#B8C4EE]" />
      </div>
    </div>
  );
}
