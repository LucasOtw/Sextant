"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "cn";

const SORTS = [
  { value: "relevance", label: "Pertinence" },
  { value: "cited", label: "Les plus cités" },
  { value: "recent", label: "Les plus récents" },
];

const TYPES = [
  { value: "all", label: "Tous les types" },
  { value: "article", label: "Articles" },
  { value: "review", label: "Revues de littérature" },
  { value: "preprint", label: "Préprints" },
  { value: "conference-paper", label: "Conférences" },
  { value: "book-chapter", label: "Chapitres" },
];

const LANGS = [
  { value: "all", label: "Toutes les langues" },
  { value: "fr", label: "Français" },
  { value: "en", label: "Anglais" },
  { value: "es", label: "Espagnol" },
  { value: "de", label: "Allemand" },
  { value: "pt", label: "Portugais" },
  { value: "it", label: "Italien" },
];

const OA = [
  { value: "all", label: "Tous les accès" },
  { value: "1", label: "Accès ouvert uniquement" },
];

interface Props {
  className?: string;
  /** Valeurs affichées quand l'URL ne précise rien (ex. page thématique : tri par citations, année récente). */
  defaults?: { sort?: string; from?: string; to?: string };
}

export function SearchFilters({ className, defaults }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "" || v === "all") next.delete(k);
        else next.set(k, v);
      }
      next.delete("page");
      startTransition(() => router.push(`${pathname}?${next.toString()}`));
    },
    [params, pathname, router],
  );

  const hasFilters = ["type", "oa", "from", "to", "sort", "lang"].some((k) => params.has(k));

  return (
    <div className={cn("flex flex-col gap-3", pending && "opacity-70", className)} aria-busy={pending}>
      <Field label="Trier par">
        <Select items={SORTS} value={params.get("sort") ?? defaults?.sort ?? "relevance"} onValueChange={(v) => update({ sort: v === "relevance" ? null : String(v) })}>
          <SelectTrigger className="w-full" aria-label="Trier par"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SORTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Type de document">
        <Select items={TYPES} value={params.get("type") ?? "all"} onValueChange={(v) => update({ type: String(v) })}>
          <SelectTrigger className="w-full" aria-label="Type de document"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TYPES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Langue">
        <Select items={LANGS} value={params.get("lang") ?? "all"} onValueChange={(v) => update({ lang: String(v) })}>
          <SelectTrigger className="w-full" aria-label="Langue"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LANGS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Accès">
        <Select items={OA} value={params.get("oa") ?? "all"} onValueChange={(v) => update({ oa: String(v) })}>
          <SelectTrigger className="w-full" aria-label="Accès"><SelectValue /></SelectTrigger>
          <SelectContent>
            {OA.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Années">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            placeholder="De"
            aria-label="Année de début"
            min={1800}
            max={2100}
            defaultValue={params.get("from") ?? defaults?.from ?? ""}
            onBlur={(e) => update({ from: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && update({ from: e.currentTarget.value })}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            inputMode="numeric"
            placeholder="À"
            aria-label="Année de fin"
            min={1800}
            max={2100}
            defaultValue={params.get("to") ?? defaults?.to ?? ""}
            onBlur={(e) => update({ to: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && update({ to: e.currentTarget.value })}
          />
        </div>
      </Field>

      {hasFilters && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => update({ type: null, oa: null, from: null, to: null, sort: null, lang: null })}>
          <XIcon /> Réinitialiser
        </Button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
      {label}
      <span className="text-base font-normal text-foreground">{children}</span>
    </label>
  );
}
