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
export const MAX_FEEDBACK_DESCRIPTION = 2000;

export const KIND_LABEL: Record<FeedbackKind, string> = { bug: "Bug", idea: "Idée" };
export const STATUS_LABEL: Record<FeedbackStatus, string | null> = { open: null, planned: "Prévu", done: "Fait", declined: "Pas pour l'instant" };

export function sanitizeFeedback(input: unknown): { kind: FeedbackKind; title: string; description: string } | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  const kind = o.kind === "bug" || o.kind === "idea" ? o.kind : null;
  const title = cleanText(o.title, MAX_FEEDBACK_TITLE);
  const description = cleanText(o.description, MAX_FEEDBACK_DESCRIPTION, true);
  if (!kind || title.length < 5) return null;
  return { kind, title, description };
}
