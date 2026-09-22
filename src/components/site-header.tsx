import Link from "next/link";
import { SearchForm } from "@/components/search-form";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="font-serif text-2xl leading-none tracking-tight">
          Veille<span className="text-accent-brand">.</span>
        </Link>
        <div className="ml-auto hidden w-full max-w-md md:block">
          <SearchForm size="compact" />
        </div>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
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
