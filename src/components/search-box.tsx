"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CornerDownLeftIcon, FileTextIcon, LayersIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Suggestion } from "@/app/api/suggest/route";
import { THEMES } from "@/lib/themes";
import { formatCount } from "@/lib/format";
import { cn } from "cn";

interface Props {
  defaultValue?: string;
  size?: "hero" | "compact";
  /** Paramètres à conserver (sujet, citations…) lors d'une nouvelle recherche. */
  hidden?: Record<string, string | undefined>;
  className?: string;
  autoFocus?: boolean;
}

type Item =
  | { kind: "search"; label: string; href: string }
  | { kind: "theme"; label: string; description: string; href: string }
  | { kind: "work"; label: string; hint: string | null; citations: number; href: string };

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function SearchBox({ defaultValue = "", size = "compact", hidden, className, autoFocus }: Props) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState(defaultValue);
  const [works, setWorks] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hero = size === "hero";

  const searchHref = (q: string) => {
    const params = new URLSearchParams();
    params.set("q", q);
    for (const [k, v] of Object.entries(hidden ?? {})) if (v) params.set(k, v);
    return `/search?${params.toString()}`;
  };

  // Suggestions : on interroge OpenAlex après une courte pause de frappe.
  useEffect(() => {
    const q = query.trim();
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      if (q.length < 2) {
        setWorks([]);
        return;
      }
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = (await res.json()) as { results: Suggestion[] };
        setWorks(data.results ?? []);
      } catch {
        /* requête annulée ou réseau indisponible : on garde la liste précédente */
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  // Fermer au clic à l'extérieur.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const q = query.trim();
  const nq = normalize(q);
  const themes = q.length >= 2 ? THEMES.filter((t) => normalize(t.name).includes(nq)).slice(0, 2) : [];
  const items: Item[] = q
    ? [
        { kind: "search", label: q, href: searchHref(q) },
        ...themes.map<Item>((t) => ({ kind: "theme", label: t.name, description: t.description, href: `/theme/${t.slug}` })),
        ...works.map<Item>((w) => ({ kind: "work", label: w.title, hint: w.hint, citations: w.citations, href: `/article/${w.id}` })),
      ]
    : [];
  const showList = open && items.length > 0;

  function go(item: Item) {
    setOpen(false);
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      go(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className={cn("relative w-full", className)}>
      <form
        role="search"
        className="flex w-full items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (q) go({ kind: "search", label: q, href: searchHref(q) });
        }}
      >
        <div className="relative flex-1">
          <SearchIcon
            className={cn(
              "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
              hero ? "left-4 size-5" : "left-3 size-4",
            )}
          />
          <Input
            type="search"
            name="q"
            value={query}
            autoFocus={autoFocus}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(-1);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={hero ? "Mots-clés, titre, auteur…" : "Rechercher…"}
            autoComplete="off"
            aria-label="Rechercher des articles"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            className={cn(
              "bg-card",
              hero ? "h-13 rounded-xl pl-12 text-lg md:text-lg shadow-sm" : "h-10 pl-9 text-base md:text-base",
            )}
          />
        </div>
        <Button type="submit" size="lg" className={cn(hero ? "h-13 rounded-xl px-6 text-base" : "h-10 px-4")}>
          Rechercher
        </Button>
      </form>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/10 animate-in fade-in zoom-in-98 slide-in-from-top-1 duration-150 motion-reduce:animate-none"
        >
          {items.map((item, i) => (
            <li key={item.href} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <Link
                href={item.href}
                onMouseEnter={() => setActive(i)}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                  i === active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                )}
              >
                <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:size-4">
                  {item.kind === "search" ? <SearchIcon /> : item.kind === "theme" ? <LayersIcon /> : <FileTextIcon />}
                </span>
                <span className="min-w-0 flex-1">
                  {item.kind === "search" && (
                    <span className="block">
                      Rechercher « <span className="font-medium">{item.label}</span> »
                    </span>
                  )}
                  {item.kind === "theme" && (
                    <>
                      <span className="block font-medium">{item.label}</span>
                      <span className="block truncate text-sm text-muted-foreground">Thématique · {item.description}</span>
                    </>
                  )}
                  {item.kind === "work" && (
                    <>
                      <span className="block truncate">{item.label}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {item.hint}
                        {item.citations > 0 && <> · {formatCount(item.citations)} citations</>}
                      </span>
                    </>
                  )}
                </span>
                {item.kind === "search" && i === active && (
                  <CornerDownLeftIcon className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
