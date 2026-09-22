/** Historique local des articles consultés (localStorage, aucun envoi serveur). */
export interface RecentWork {
  id: string;
  title: string;
  authors: string;
  venue: string | null;
  year: number | null;
  isOa: boolean;
  viewedAt: number;
}

export const RECENT_KEY = "veille:recent";
const MAX = 12;

export function readRecent(): RecentWork[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as RecentWork[]) : [];
    return Array.isArray(list) ? list : [];
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
