import Link from "next/link";
import { HeaderSearch } from "@/components/header-search";
import { HeaderNav } from "@/components/header-nav";
import { LogoMark } from "@/components/logo";
import { WelcomeDialog } from "@/components/welcome-dialog";
import { McpAnnouncement } from "@/components/mcp-announcement";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthButton } from "@/components/auth/auth-button";
import { FavoritesLink } from "@/components/favorites/favorites-link";
import { isAuthEnabled } from "@/lib/auth";

/** En-tête commun, identique pour tous (pages en cache) : le compte s'affiche côté client (AuthButton, PERF-01). */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Link href="/" prefetch={false} className="group flex items-center gap-2.5" aria-label="Sextant, accueil">
          <LogoMark className="size-9 text-foreground transition-transform duration-300 group-hover:-rotate-6" />
          {/* Le nom s'efface sous sm pour que l'en-tête tienne dans 320 px ; le lien garde son aria-label. */}
          <span className="hidden text-lg font-semibold tracking-tight sm:inline">Sextant</span>
        </Link>
        <div className="hidden flex-1 justify-center md:flex">
          <HeaderSearch />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <HeaderNav />
          {isAuthEnabled() && <FavoritesLink />}
          <ThemeToggle />
          {isAuthEnabled() && <AuthButton />}
        </div>
      </div>
      <WelcomeDialog />
      <McpAnnouncement />
    </header>
  );
}
