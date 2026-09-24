/** « Pour vous » : ce que renvoie /api/recommendations, et les préférences locales (articles écartés). */
import type { Work } from "@/lib/openalex";

export interface RecommendationSeed {
  id: string;
  title: string;
}

export interface Recommendation {
  work: Work;
  /** `related` : apparenté (OpenAlex related_works) à vos articles ; `topic` : récent et cité sur un de vos sujets. */
  reason: { kind: "related" | "topic"; topic?: string; seeds: RecommendationSeed[] };
}

export const HIDDEN_KEY = "sextant:reco-hidden";
const MAX_HIDDEN = 200;

export function readHidden(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function hideRecommendation(id: string) {
  try {
    const list = [id, ...readHidden().filter((x) => x !== id)].slice(0, MAX_HIDDEN);
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(list));
  } catch {
    /* stockage indisponible */
  }
}

export function unhideRecommendation(id: string) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(readHidden().filter((x) => x !== id)));
  } catch {
    /* stockage indisponible */
  }
}

export function clearHidden() {
  try {
    localStorage.removeItem(HIDDEN_KEY);
  } catch {
    /* stockage indisponible */
  }
}

/** Phrase « pourquoi » d'une suggestion. */
export function reasonText(r: Recommendation["reason"]): string {
  const names = r.seeds.map((s) => `« ${s.title} »`);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}` : names[0] ?? "vos lectures";
  return r.kind === "related" ? `Proche de ${list}` : `Récent et cité sur « ${r.topic} », comme ${list}`;
}
