"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BuildingIcon, ExternalLinkIcon, FileTextIcon, SearchIcon } from "lucide-react";
import type { AuthorProfile } from "@/lib/openalex";
import { formatCount } from "@/lib/format";
import { cn } from "cn";

interface Props {
  authorId: string | null;
  name: string;
  institution?: string | null;
  /** Identifiant OpenAlex de l'institution indiquée sur l'article (repli pour le lien vers son site). */
  institutionId?: string | null;
}

const cache = new Map<string, Promise<AuthorProfile | null>>();

function load(id: string, instId: string | null): Promise<AuthorProfile | null> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`/api/author?id=${id}${instId ? `&inst=${instId}` : ""}`)
      .then((r) => (r.ok ? (r.json() as Promise<AuthorProfile>) : null))
      .catch(() => null);
    cache.set(id, p);
  }
  return p;
}

/** Nom d'auteur avec carte au survol : institution (lien vers son site), ORCID, Wikipédia, tous ses articles. */
export function AuthorChip({ authorId, name, institution, institutionId }: Props) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<AuthorProfile | null | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  const id = authorId?.replace(/^.*\//, "") ?? null;
  const instId = institutionId?.replace(/^.*\//, "") ?? null;

  function show() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 180);
  }
  function hide() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 160);
  }

  useEffect(() => {
    if (!open || !id || profile !== undefined) return;
    let alive = true;
    load(id, instId).then((p) => alive && setProfile(p));
    return () => {
      alive = false;
    };
  }, [open, id, instId, profile]);

  // Fermer au clic à l'extérieur (mobile : le nom s'ouvre au tap).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  if (!id) return <span className="font-medium">{name}</span>;

  const wiki = `https://fr.wikipedia.org/w/index.php?search=${encodeURIComponent(name)}`;

  return (
    <span ref={wrapRef} className="relative inline-block" onMouseEnter={show} onMouseLeave={hide}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onFocus={show}
        onBlur={hide}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "rounded-sm font-medium underline decoration-foreground/25 decoration-dotted underline-offset-3 transition-colors hover:text-accent-brand hover:decoration-accent-brand focus-visible:outline-2 focus-visible:outline-ring",
          open && "text-accent-brand decoration-accent-brand",
        )}
      >
        {name}
      </button>

      {open && (
        <span
          role="dialog"
          aria-label={`À propos de ${name}`}
          className="absolute left-0 top-full z-50 mt-2 block w-72 rounded-xl bg-popover p-4 text-left text-sm font-normal text-popover-foreground shadow-lg ring-1 ring-foreground/10 animate-in fade-in zoom-in-98 slide-in-from-top-1 duration-150 motion-reduce:animate-none"
        >
          <span className="block text-base font-semibold">{name}</span>
          <span className="mt-0.5 flex items-start gap-1.5 text-muted-foreground">
            <BuildingIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {profile === undefined ? (
              <span className="shimmer inline-block h-3.5 w-40 rounded" />
            ) : profile?.institution ? (
              profile.institution.homepage ? (
                <a href={profile.institution.homepage} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-accent-brand">
                  {profile.institution.name}
                  <ExternalLinkIcon className="ml-1 inline size-3" aria-hidden />
                </a>
              ) : (
                <span>{profile.institution.name}</span>
              )
            ) : (
              <span>{institution ?? "Institution inconnue"}</span>
            )}
          </span>

          {profile && (
            <span className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat label="Articles" value={formatCount(profile.worksCount)} />
              <Stat label="Citations" value={formatCount(profile.citedByCount)} />
              <Stat label="Indice h" value={profile.hIndex != null ? String(profile.hIndex) : "–"} />
            </span>
          )}

          <span className="mt-3 flex flex-col gap-1.5">
            <Link href={`/search?author=${id}`} className="inline-flex items-center gap-1.5 hover:text-accent-brand">
              <FileTextIcon className="size-3.5" aria-hidden /> Tous ses articles sur Sextant
            </Link>
            {profile?.orcid && (
              <a href={profile.orcid} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-accent-brand">
                <span className="inline-flex size-3.5 items-center justify-center rounded-full bg-[#A6CE39] text-[8px] font-bold text-white" aria-hidden>iD</span>
                Profil ORCID
              </a>
            )}
            <a href={wiki} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-accent-brand">
              <SearchIcon className="size-3.5" aria-hidden /> Chercher sur Wikipédia
            </a>
          </span>
        </span>
      )}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-lg bg-muted px-2 py-1.5">
      <span className="block text-[15px] font-semibold">{value}</span>
      <span className="block text-[11px] text-muted-foreground">{label}</span>
    </span>
  );
}
