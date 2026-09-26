"use client";

import { useState } from "react";
import { BookmarkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { EmptyState } from "@/components/empty-state";

interface Props {
  icon?: React.ReactNode;
  title?: string;
  text?: string;
  intro?: string;
}

/** Page personnelle sans session (favoris par défaut) : on explique et on propose la connexion sur place. */
export function SignInPrompt({
  icon = <BookmarkIcon className="mx-auto size-8 text-brand" aria-hidden />,
  title = "Vos favoris vous attendent.",
  text = "Connectez-vous pour retrouver les articles que vous avez enregistrés, sur tous vos appareils.",
  intro = "Connectez-vous pour retrouver vos favoris et vos listes sur tous vos appareils.",
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <EmptyState
      icon={icon}
      title={title}
      hint={text}
      action={
        <>
          <Button size="lg" className="mt-5" onClick={() => setOpen(true)}>Se connecter</Button>
          <SignInDialog open={open} onOpenChange={setOpen} intro={intro} />
        </>
      }
    />
  );
}
