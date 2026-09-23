"use client";

import { useState } from "react";
import { BookmarkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignInDialog } from "@/components/auth/sign-in-dialog";

/** Page /favoris sans session : on explique et on propose la connexion sur place. */
export function SignInPrompt() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-dashed p-10 text-center">
      <BookmarkIcon className="mx-auto size-8 text-accent-brand" aria-hidden />
      <p className="mt-3 text-lg font-medium">Vos favoris vous attendent.</p>
      <p className="mt-1 text-base text-muted-foreground">
        Connectez-vous pour retrouver les articles que vous avez enregistrés, sur tous vos appareils.
      </p>
      <Button size="lg" className="mt-5" onClick={() => setOpen(true)}>Se connecter</Button>
      <SignInDialog open={open} onOpenChange={setOpen} intro="Connectez-vous pour retrouver vos favoris et vos collections sur tous vos appareils." />
    </div>
  );
}
