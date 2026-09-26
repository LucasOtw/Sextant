/**
 * Historique local des articles consultés (localStorage). Les identifiants sont envoyés à /api/recommendations pour
 * calculer « Pour vous », sans stockage applicatif côté serveur (SEC-18) ; l'historique lui-même reste sur l'appareil.
 */
import { WORK_ID } from "@/lib/ids";
import { readStoredJson, removeStored, writeStored } from "@/lib/client/storage";

export interface RecentWork {
  id: string;
  title: string;
  authors: string;
  venue: string | null;
  year: number | null;
  isOa: boolean;
  viewedAt: number;
}

export const RECENT_KEY = "sextant:recent";
const MAX = 12;

/**
 * Garde de type : le stockage local est modifiable par le visiteur, une extension ou un ancien format.
 * Un élément invalide rendu tel quel ferait planter l'accueil ; il est écarté.
 */
function isRecentWork(value: unknown): value is RecentWork {
  if (typeof value !== "object" || value === null) return false;
  const w = value as Record<string, unknown>;
  return (
    typeof w.id === "string" &&
    WORK_ID.test(w.id) &&
    typeof w.title === "string" &&
    typeof w.authors === "string" &&
    (w.venue === null || typeof w.venue === "string") &&
    (w.year === null || typeof w.year === "number") &&
    typeof w.isOa === "boolean" &&
    typeof w.viewedAt === "number"
  );
}

/** Liste validée élément par élément : `pushRecent` la réécrit à la consultation suivante, la corruption se répare seule. */
export function readRecent(): RecentWork[] {
  const list = readStoredJson(RECENT_KEY);
  return Array.isArray(list) ? list.filter(isRecentWork).slice(0, MAX) : [];
}

export function pushRecent(work: Omit<RecentWork, "viewedAt">) {
  const list = readRecent().filter((w) => w.id !== work.id);
  list.unshift({ ...work, viewedAt: Date.now() });
  writeStored(RECENT_KEY, JSON.stringify(list.slice(0, MAX)));
}

export function clearRecent() {
  removeStored(RECENT_KEY);
}

/**
 * « Annuler » après « Effacer l'historique » : remet la liste effacée, après les consultations faites entre-temps
 * (elles restent en tête), sans doublon.
 */
export function restoreRecent(previous: RecentWork[]) {
  const current = readRecent();
  const ids = new Set(current.map((w) => w.id));
  writeStored(RECENT_KEY, JSON.stringify([...current, ...previous.filter((w) => !ids.has(w.id))].slice(0, MAX)));
}
