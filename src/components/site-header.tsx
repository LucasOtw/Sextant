import Link from "next/link";
import { HeaderSearch } from "@/components/header-search";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="text-xl font-semibold leading-none tracking-tight">
          Veille<span className="text-accent-brand">.</span>
        </Link>
        <HeaderSearch />
        <nav className="ml-auto flex items-center gap-5 text-[15px] text-muted-foreground">
          <Link href="/#themes" className="hover:text-foreground">
            Thématiques
          </Link>
          <Link href="/#selection" className="hidden hover:text-foreground sm:inline">
            Sélection
          </Link>
        </nav>
      </div>
    </header>
  );
}
