import Link from "next/link";
import { TelescopeIcon } from "lucide-react";
import { HeaderSearch } from "@/components/header-search";
import { HeaderNav } from "@/components/header-nav";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5" aria-label="Veille, accueil">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform group-hover:-rotate-6">
            <TelescopeIcon className="size-5" strokeWidth={2.2} aria-hidden />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-lg font-semibold tracking-tight">Veille</span>
            <span className="hidden text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground sm:block">
              Recherche scientifique
            </span>
          </span>
        </Link>
        <div className="flex flex-1 justify-center">
          <HeaderSearch />
        </div>
        <HeaderNav />
      </div>
    </header>
  );
}
