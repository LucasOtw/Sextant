"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LockOpenIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clearRecent, readRecent, restoreRecent, type RecentWork } from "@/lib/recent";
import { undoToast } from "@/lib/undo-toast";

/**
 * « Consultés récemment » : lu côté client, masqué quand l'historique est vide. Effacé pendant la visite, la section
 * reste (titre et message) : le bouton disparaît sous le focus, qui passe au titre plutôt que sur la page (A11Y-19).
 */
export function RecentlyViewed() {
  const [items, setItems] = useState<RecentWork[]>([]);
  const [cleared, setCleared] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture du stockage local après hydratation
    setItems(readRecent());
  }, []);

  useEffect(() => {
    if (!focusHeading.current) return;
    focusHeading.current = false;
    headingRef.current?.focus();
  });

  function clear() {
    const previous = items;
    clearRecent();
    setItems([]);
    setCleared(true);
    focusHeading.current = true;
    undoToast("Historique effacé.", () => {
      restoreRecent(previous);
      setItems(readRecent());
    });
  }

  if (items.length === 0 && !cleared) return null;

  return (
    <section id="recents" className="py-8 pb-16 animate-in fade-in duration-500 motion-reduce:animate-none">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 ref={headingRef} tabIndex={-1} className="title-display type-h2 outline-none">Consultés récemment</h2>
          <p className="mt-1.5 max-w-measure-text text-muted-foreground">
            Gardé sur cet appareil uniquement, pour reprendre où vous en étiez.
          </p>
        </div>
        {items.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clear}>
            <Trash2Icon /> Effacer l'historique
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-meta text-muted-foreground">Historique effacé. Les prochains articles consultés apparaîtront ici.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.slice(0, 6).map((w, i) => (
            <li key={w.id} className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-400 motion-reduce:animate-none" style={{ animationDelay: `${i * 50}ms` }}>
              <Link
                href={`/article/${w.id}`}
                className="flex h-full flex-col gap-2 rounded-xl bg-card p-4 border border-border transition-all duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-md hover:border-foreground/25"
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
                <span className="line-clamp-1 text-meta text-muted-foreground">
                  {w.authors}
                  {w.venue && <> · <span className="italic">{w.venue}</span></>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
