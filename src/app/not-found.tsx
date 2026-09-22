import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="title-serif text-4xl">Page introuvable</h1>
      <p className="text-muted-foreground">Cet article ou cette page n'existe pas, ou l'identifiant est incorrect.</p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>Retour à l'accueil</Link>
    </div>
  );
}
