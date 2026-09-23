import Link from "next/link";
import { HeaderSearch } from "@/components/header-search";
import { HeaderNav } from "@/components/header-nav";
import { LogoMark } from "@/components/logo";
import { WelcomeDialog } from "@/components/welcome-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthButton } from "@/components/auth/auth-button";
import { getCurrentUser, isAuthEnabled } from "@/lib/auth";

export async function SiteHeader() {
  const user = isAuthEnabled() ? await getCurrentUser() : null;
  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5" aria-label="Sextant, accueil">
          <LogoMark className="size-9 text-foreground transition-transform duration-300 group-hover:-rotate-6" />
          <span className="text-lg font-semibold tracking-tight">Sextant</span>
        </Link>
        <div className="flex flex-1 justify-center">
          <HeaderSearch />
        </div>
        <div className="flex items-center gap-1">
          <HeaderNav />
          <ThemeToggle />
          {isAuthEnabled() && <AuthButton user={user} />}
        </div>
      </div>
      <WelcomeDialog />
    </header>
  );
}
