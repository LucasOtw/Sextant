"use client";

import { useState } from "react";
import { BookmarkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignInDialog } from "@/components/auth/sign-in-dialog";

interface Props {
  icon?: React.ReactNode;
  title?: string;
  text?: string;
  intro?: string;
}

/** Page personnelle sans session (favoris par défaut) : on explique et on propose la connexion sur place. */
export function SignInPrompt({
  icon = <BookmarkIcon className="mx-auto size-8 text-accent-brand" aria-hidden />,
  title = "Vos favoris vous attendent.",
  text = "Connectez-vous pour retrouver les articles que vous avez enregistrés, sur tous vos appareils.",
  intro = "Connectez-vous pour retrouver vos favoris et vos listes sur tous vos appareils.",
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-dashed p-10 text-center">
      {icon}
      <p className="mt-3 text-lg font-medium">{title}</p>
      <p className="mt-1 text-base text-muted-foreground">{text}</p>
      <Button size="lg" className="mt-5" onClick={() => setOpen(true)}>Se connecter</Button>
      <SignInDialog open={open} onOpenChange={setOpen} intro={intro} />
    </div>
  );
}
