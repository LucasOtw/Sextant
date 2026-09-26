/** « Pour vous » : ce que renvoie /api/recommendations, et les préférences locales (articles écartés). */
import type { Work } from "@/lib/openalex";
import { readStoredJson, removeStored, writeStored } from "@/lib/client/storage";

export interface RecommendationSeed {
  id: string;
  title: string;
}

export interface Recommendation {
  work: Work;
  /** `related` : apparenté (OpenAlex related_works) à vos articles ; `topic` : récent et cité sur un de vos sujets. */
  reason: { kind: "related" | "topic"; topic?: string; seeds: RecommendationSeed[] };
}

/**
 * Identifiants envoyés à /api/recommendations, au plus : consultés, favoris, écartés. Le client coupe ses listes à ces
 * bornes et la route n'en lit pas davantage : une seule valeur à changer pour les deux (QUAL-24).
 */
export const RECO_LIMITS = { seen: 12, fav: 30, hide: 200 } as const;

export const HIDDEN_KEY = "sextant:reco-hidden";

export function readHidden(): string[] {
  const list = readStoredJson(HIDDEN_KEY);
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
}

export function hideRecommendation(id: string) {
  writeStored(HIDDEN_KEY, JSON.stringify([id, ...readHidden().filter((x) => x !== id)].slice(0, RECO_LIMITS.hide)));
}

export function unhideRecommendation(id: string) {
  writeStored(HIDDEN_KEY, JSON.stringify(readHidden().filter((x) => x !== id)));
}

export function clearHidden() {
  removeStored(HIDDEN_KEY);
}

/** Phrase « pourquoi » d'une suggestion. */
export function reasonText(r: Recommendation["reason"]): string {
  const names = r.seeds.map((s) => `« ${s.title} »`);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}` : names[0] ?? "vos lectures";
  return r.kind === "related" ? `Proche de ${list}` : `Récent et cité sur « ${r.topic} », comme ${list}`;
}
