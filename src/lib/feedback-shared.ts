import { cleanText } from "@/lib/highlights-shared";

/** « Bugs et idées » : signalements et demandes publics, sans auteur affiché, départagés par des votes. */
export type FeedbackKind = "bug" | "idea";
/** Posé à la main (console Firebase) quand un sujet avance. */
export type FeedbackStatus = "open" | "planned" | "done" | "declined";

export interface FeedbackItem {
  id: string;
  kind: FeedbackKind;
  title: string;
  description: string;
  votes: number;
  status: FeedbackStatus;
  createdAt: string | null;
}

export const MAX_FEEDBACK_TITLE = 120;
/** Longueur minimale du titre, annoncée sous le champ (A11Y-21) et vérifiée par l'API. */
export const MIN_FEEDBACK_TITLE = 5;
export const MAX_FEEDBACK_DESCRIPTION = 2000;

export const KIND_LABEL: Record<FeedbackKind, string> = { bug: "Bug", idea: "Idée" };
export const STATUS_LABEL: Record<FeedbackStatus, string | null> = { open: null, planned: "Prévu", done: "Fait", declined: "Pas pour l'instant" };

/** Ordre d'affichage des sujets (identifiants) : les plus votés (puis les plus récents), ou les plus récents. */
export function feedbackOrder(items: FeedbackItem[], sort: string): string[] {
  const byDate = (a: FeedbackItem, b: FeedbackItem) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  return [...items].sort((a, b) => (sort === "recent" ? byDate(a, b) : b.votes - a.votes || byDate(a, b))).map((i) => i.id);
}

/**
 * Sujets dans un ordre figé (A11Y-19) : un vote ne déplace pas la ligne sous le focus ni sous le pointeur. Les sujets
 * absents de l'ordre (publiés depuis) passent en tête.
 */
export function inOrder(items: FeedbackItem[], order: string[]): FeedbackItem[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => (rank.get(a.id) ?? -1) - (rank.get(b.id) ?? -1));
}

/** Caractères du titre qui comptent pour le minimum, comptés comme le serveur (espaces en trop et caractères invisibles exclus). */
export function feedbackTitleLength(title: string): number {
  return cleanText(title, MAX_FEEDBACK_TITLE).length;
}

/**
 * Indication sous le titre : la règle et la progression tant qu'elle n'est pas remplie, puis rien de plus que la règle.
 * `error` : l'envoi a été tenté avec un titre trop court (texte d'erreur, lu au retour du focus sur le champ).
 */
export function feedbackTitleHint(length: number, error = false): string {
  if (error) return `Titre trop court : ${MIN_FEEDBACK_TITLE} caractères minimum (${length} pour l'instant).`;
  return length < MIN_FEEDBACK_TITLE ? `${MIN_FEEDBACK_TITLE} caractères minimum (${length}/${MIN_FEEDBACK_TITLE})` : `${MIN_FEEDBACK_TITLE} caractères minimum`;
}

export function sanitizeFeedback(input: unknown): { kind: FeedbackKind; title: string; description: string } | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  const kind = o.kind === "bug" || o.kind === "idea" ? o.kind : null;
  const title = cleanText(o.title, MAX_FEEDBACK_TITLE);
  const description = cleanText(o.description, MAX_FEEDBACK_DESCRIPTION, true);
  if (!kind || title.length < MIN_FEEDBACK_TITLE) return null;
  return { kind, title, description };
}
