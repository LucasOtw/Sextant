"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LockOpenIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clearRecent, readRecent, type RecentWork } from "@/lib/recent";

/** « Consultés récemment » : lu côté client, masqué quand l'historique est vide. */
export function RecentlyViewed() {
  const [items, setItems] = useState<RecentWork[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture du stockage local après hydratation
    setItems(readRecent());
  }, []);

  if (items.length === 0) return null;

  return (
    <section id="recents" className="scroll-mt-20 py-8 pb-16 animate-in fade-in duration-500 motion-reduce:animate-none">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="title-display text-3xl sm:text-4xl">Consultés récemment</h2>
          <p className="mt-1.5 text-base text-muted-foreground">
            Gardé sur cet appareil uniquement, pour reprendre où vous en étiez.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            clearRecent();
            setItems([]);
          }}
        >
          <Trash2Icon /> Effacer l'historique
        </Button>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.slice(0, 6).map((w, i) => (
          <li key={w.id} className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-400 motion-reduce:animate-none" style={{ animationDelay: `${i * 50}ms` }}>
            <Link
              href={`/article/${w.id}`}
              className="flex h-full flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-foreground/25"
            >
              <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                {w.isOa && (
                  <Badge className="bg-oa text-oa-foreground">
                    <LockOpenIcon aria-hidden /> Accès ouvert
                  </Badge>
                )}
                {w.year && <span>{w.year}</span>}
              </span>
              <span className="title-display line-clamp-2 text-lg leading-snug">{w.title}</span>
              <span className="line-clamp-1 text-[15px] text-muted-foreground">
                {w.authors}
                {w.venue && <> · <span className="italic">{w.venue}</span></>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
