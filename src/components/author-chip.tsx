"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Popover } from "@base-ui/react/popover";
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
    // Seul un « introuvable » (404) est mémorisé : un refus de débit (429) ou une panne se retente au prochain survol.
    p = fetch(`/api/author?id=${id}${instId ? `&inst=${instId}` : ""}`)
      .then((r) => {
        if (r.ok) return r.json() as Promise<AuthorProfile>;
        if (r.status !== 404) cache.delete(id);
        return null;
      })
      .catch(() => {
        cache.delete(id);
        return null;
      });
    cache.set(id, p);
  }
  return p;
}

/**
 * Nom d'auteur avec carte au survol : institution (lien vers son site), ORCID, Wikipédia, tous ses articles.
 * Popover Base UI : ouverture au survol, au clic ou au tap, et au clavier par Entrée ou Espace. Les liens de la carte
 * se parcourent à la tabulation, Échap la referme et rend le focus au nom.
 */
export function AuthorChip({ authorId, name, institution, institutionId }: Props) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<AuthorProfile | null | undefined>(undefined);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const id = authorId?.replace(/^.*\//, "") ?? null;
  const instId = institutionId?.replace(/^.*\//, "") ?? null;

  // Profil chargé à la première ouverture seulement.
  useEffect(() => {
    if (!open || !id || profile !== undefined) return;
    let alive = true;
    load(id, instId).then((p) => alive && setProfile(p));
    return () => {
      alive = false;
    };
  }, [open, id, instId, profile]);

  // La carte n'est pas modale : quand la tabulation sort du nom et de la carte, on la referme pour qu'elle ne masque
  // pas l'élément focalisé ensuite (WCAG 2.4.11). Vérification différée : Base UI fait transiter le focus par des
  // éléments de garde entre le nom et la carte, rendue dans un portail.
  function closeIfFocusLeft() {
    setTimeout(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return; // clic hors de tout élément focalisable : géré par Base UI
      if (el === triggerRef.current || popupRef.current?.contains(el)) return;
      setOpen(false);
    }, 0);
  }

  if (!id) return <span className="font-medium">{name}</span>;

  const wiki = `https://fr.wikipedia.org/w/index.php?search=${encodeURIComponent(name)}`;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        openOnHover
        delay={180}
        closeDelay={160}
        ref={triggerRef}
        onBlur={closeIfFocusLeft}
        className={cn(
          "rounded-sm font-medium underline decoration-foreground/25 decoration-dotted underline-offset-3 transition-colors hover:text-accent-brand hover:decoration-accent-brand focus-visible:outline-2 focus-visible:outline-ring",
          open && "text-accent-brand decoration-accent-brand",
        )}
      >
        {name}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          // Dessous ou dessus seulement : sur un écran étroit, une carte posée à droite du nom n'a pas la place.
          collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "none" }}
          className="isolate z-50"
        >
          <Popover.Popup
            ref={popupRef}
            onBlur={closeIfFocusLeft}
            aria-label={`À propos de ${name}`}
            className="w-72 max-w-(--available-width) origin-(--transform-origin) rounded-xl bg-popover p-4 text-left text-sm font-normal text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-98 data-open:slide-in-from-top-1 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none"
          >
            <p className="text-base font-semibold">{name}</p>
            <p className="mt-0.5 flex items-start gap-1.5 text-muted-foreground">
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
            </p>

            {profile && (
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Articles" value={formatCount(profile.worksCount)} />
                <Stat label="Citations" value={formatCount(profile.citedByCount)} />
                <Stat label="Indice h" value={profile.hIndex != null ? String(profile.hIndex) : "–"} />
              </div>
            )}

            <div className="mt-3 flex flex-col items-start gap-1.5">
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
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
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
