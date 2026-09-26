/**
 * Choix de phrases à surligner sans sélection à la souris (A11Y-18) : le texte est découpé en phrases, l'utilisateur
 * en coche, et les phrases qui se suivent forment un seul passage. Le format produit (texte, contexte avant et après)
 * est celui de `readSelection` : le résumé et le lecteur PDF retrouvent et marquent ces passages comme les autres.
 */

import { joinFragments } from "@/lib/pdf-marks";

export interface Sentence {
  text: string;
  /** Position dans le texte d'origine : [start, end[. */
  start: number;
  end: number;
}

export interface Passage {
  text: string;
  prefix: string;
  suffix: string;
}

/** Longueur du contexte gardé de part et d'autre (comme `readSelection`). */
const CONTEXT = 60;

const squash = (s: string) => s.replace(/\s+/g, " ");
const normalize = (s: string) => squash(s).trim().toLowerCase();

/** Découpe `full` en phrases (Intl.Segmenter, ou un découpage simple sur la ponctuation s'il manque). */
export function splitSentences(full: string, locale = "fr"): Sentence[] {
  const raw: { start: number; end: number }[] = [];
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    for (const s of new Intl.Segmenter(locale, { granularity: "sentence" }).segment(full)) {
      raw.push({ start: s.index, end: s.index + s.segment.length });
    }
  } else {
    const re = /[^.!?]+(?:[.!?]+|$)/g;
    for (let m = re.exec(full); m; m = re.exec(full)) {
      if (m[0].length === 0) break;
      raw.push({ start: m.index, end: m.index + m[0].length });
    }
  }
  const out: Sentence[] = [];
  for (let { start, end } of raw) {
    while (start < end && /\s/.test(full[start])) start++;
    while (end > start && /\s/.test(full[end - 1])) end--;
    const text = squash(full.slice(start, end));
    if (text.length >= 3) out.push({ text, start, end });
  }
  return out;
}

/**
 * Passages formés par les phrases cochées (indices dans `sentences`) : des phrases consécutives n'en font qu'un.
 * Le contexte avant et après lève l'ambiguïté quand le même texte apparaît deux fois.
 */
export function passagesFrom(full: string, sentences: Sentence[], indexes: Iterable<number>): Passage[] {
  const sorted = [...new Set(indexes)].filter((i) => i >= 0 && i < sentences.length).sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const i of sorted) {
    const last = runs[runs.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else runs.push([i, i]);
  }
  return runs.map(([a, b]) => {
    const start = sentences[a].start;
    const end = sentences[b].end;
    return {
      text: squash(full.slice(start, end)).trim(),
      prefix: squash(full.slice(Math.max(0, start - CONTEXT), start)),
      suffix: squash(full.slice(end, end + CONTEXT)),
    };
  });
}

/** Phrase déjà comprise dans un passage retenu (casse et espaces ignorés). */
export function isAlreadyHighlighted(sentence: string, passages: readonly string[]): boolean {
  const s = normalize(sentence);
  return s.length > 0 && passages.some((p) => normalize(p).includes(s));
}

/**
 * Phrases cochées pas encore retenues, dans l'ordre. Après un enregistrement partiel (un passage refusé), la fenêtre
 * reste ouverte avec les phrases déjà enregistrées cochées : les renvoyer créerait des doublons.
 */
export function pendingIndexes(checked: Iterable<number>, sentences: readonly Sentence[], isHighlighted: (sentence: Sentence) => boolean): number[] {
  return [...new Set(checked)].filter((i) => i >= 0 && i < sentences.length && !isHighlighted(sentences[i])).sort((a, b) => a - b);
}

/**
 * Texte d'une page PDF tel que le voit le marquage (`markSpans`) : mêmes fragments, joints par `joinFragments`. Une fin
 * de ligne (`hasEOL`, rendue en `<br>` dans la couche texte) sépare les mots ; deux fragments collés (mot coupé par un
 * changement de police) restent collés. Une phrase prise dans ce texte est donc toujours retrouvée dans la couche texte.
 */
export function pdfPageText(items: readonly unknown[]): string {
  const fragments: string[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object" || !("str" in it) || typeof it.str !== "string") continue;
    fragments.push("hasEOL" in it && it.hasEOL === true ? `${it.str}\n` : it.str);
  }
  return joinFragments(fragments).text;
}
