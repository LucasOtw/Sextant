import Link from "next/link";
import { LogoMark } from "@/components/logo";

const LINKS = [
  { href: "/a-propos", label: "À propos" },
  { href: "/retours", label: "Bugs et idées" },
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/conditions", label: "Conditions d'utilisation" },
  { href: "/confidentialite", label: "Confidentialité" },
];

export function SiteFooter() {
  return (
    <footer className="mt-8 border-t border-border/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium">
          <LogoMark className="size-6 text-foreground" />
          Sextant
        </Link>
        <nav aria-label="Pied de page" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:text-foreground">
              {l.label}
            </Link>
          ))}
          <a href="https://openalex.org" target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">
            Données OpenAlex
          </a>
        </nav>
        <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Sextant</p>
      </div>
    </footer>
  );
}
