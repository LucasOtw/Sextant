/**
 * Historique local des articles consultés (localStorage). Les identifiants sont envoyés à /api/recommendations pour
 * calculer « Pour vous », sans stockage applicatif côté serveur (SEC-18) ; l'historique lui-même reste sur l'appareil.
 */
import { WORK_ID } from "@/lib/ids";

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
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(isRecentWork).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecent(work: Omit<RecentWork, "viewedAt">) {
  try {
    const list = readRecent().filter((w) => w.id !== work.id);
    list.unshift({ ...work, viewedAt: Date.now() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* stockage indisponible */
  }
}

export function clearRecent() {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* stockage indisponible */
  }
}

/**
 * « Annuler » après « Effacer l'historique » : remet la liste effacée, après les consultations faites entre-temps
 * (elles restent en tête), sans doublon.
 */
export function restoreRecent(previous: RecentWork[]) {
  try {
    const current = readRecent();
    const ids = new Set(current.map((w) => w.id));
    const list = [...current, ...previous.filter((w) => !ids.has(w.id))].slice(0, MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* stockage indisponible */
  }
}
