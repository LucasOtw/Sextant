import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

interface Props {
  defaultValue?: string;
  size?: "hero" | "compact";
  /** Paramètres à conserver (thématique, filtres…) lors d'une nouvelle recherche. */
  hidden?: Record<string, string | undefined>;
  className?: string;
}

export function SearchForm({ defaultValue = "", size = "compact", hidden, className }: Props) {
  const hero = size === "hero";
  return (
    <form action="/search" role="search" className={cn("flex w-full items-center gap-2", className)}>
      {hidden &&
        Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <div className="relative flex-1">
        <SearchIcon
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
            hero ? "left-4 size-5" : "left-2.5 size-4",
          )}
        />
        <Input
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder={hero ? "Mots-clés, titre, auteur, DOI…" : "Rechercher…"}
          autoComplete="off"
          aria-label="Rechercher des articles"
          className={cn(hero ? "h-12 rounded-xl pl-11 text-base md:text-base" : "pl-8")}
        />
      </div>
      <Button type="submit" size={hero ? "lg" : "default"} className={cn(hero && "h-12 rounded-xl px-5")}>
        Rechercher
      </Button>
    </form>
  );
}
