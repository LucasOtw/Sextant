import Link from "next/link";
import { TelescopeIcon } from "lucide-react";
import { HeaderSearch } from "@/components/header-search";
import { HeaderNav } from "@/components/header-nav";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5" aria-label="Veille, accueil">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform group-hover:-rotate-6">
            <TelescopeIcon className="size-5" strokeWidth={2.2} aria-hidden />
          </span>
          <span className="text-lg font-semibold tracking-tight">Veille</span>
        </Link>
        <div className="flex flex-1 justify-center">
          <HeaderSearch />
        </div>
        <div className="flex items-center gap-1">
          <HeaderNav />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
