import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { listCollections } from "@/lib/collections";
import { apaFromSnapshot, type Favorite } from "@/lib/favorites-shared";
import { countFavorites, findFavorites, getFavoritesByIds, listFavorites } from "@/lib/favorites";
import { abstractFromInvertedIndex, formatAuthors, openAccessUrl, toApa, typeLabel, venueName, workTitle } from "@/lib/format";
import { citationBlock, sourceLabel, type Highlight } from "@/lib/highlights-shared";
import { findHighlights, listHighlights } from "@/lib/highlights";
import { getNote, listNotes } from "@/lib/notes";
import { getWork, getWorksByIds, getWorksBySameTopic, searchWorks, shortId, type Work } from "@/lib/openalex";
import { SITE } from "@/lib/site";

/**
 * Outils du serveur MCP de Sextant, en lecture seule : la recherche d'articles (OpenAlex, mêmes garde-fous que le site)
 * et la bibliothèque de l'utilisateur authentifié par sa clé (favoris, listes, citations, notes).
 */

/** Passages lus au plus pour un article donné (le tri par date se fait en mémoire, sans index composite). */
const MAX_ARTICLE_HIGHLIGHTS = 200;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const articleId = z.string().regex(/^W\d{2,15}$/i, "Identifiant OpenAlex attendu, par exemple W2741809807").describe("Identifiant OpenAlex de l'article (W…)");

type Ctx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };

function uidOf(ctx: Ctx): string {
  const uid = ctx.http?.authInfo?.extra?.uid;
  if (typeof uid !== "string") throw new Error("Clé Sextant manquante ou révoquée.");
  return uid;
}

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

function fold(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function workLine(w: Work, i?: number): string {
  const id = shortId(w.id);
  const venue = venueName(w);
  const oa = openAccessUrl(w);
  return [
    `${i !== undefined ? `${i + 1}. ` : ""}${workTitle(w)} (${w.publication_year ?? "s. d."})`,
    `   ${formatAuthors(w, 3)}${venue ? ` — ${venue}` : ""} — ${typeLabel(w.type)} — cité ${w.cited_by_count} fois${w.open_access.is_oa ? " — accès ouvert" : ""}`,
    `   id ${id} · ${SITE.url}/article/${id}${oa ? ` · texte : ${oa.url}` : ""}`,
  ].join("\n");
}

function favoriteLine(f: Favorite, i: number): string {
  return `${i + 1}. ${f.title} (${f.year ?? "s. d."})\n   ${f.authors}${f.venue ? ` — ${f.venue}` : ""} — id ${f.id} · ${SITE.url}/article/${f.id}`;
}

export function registerSextantTools(server: McpServer) {
  server.registerTool(
    "search_articles",
    {
      title: "Chercher des articles",
      description:
        "Cherche des publications scientifiques vérifiées (articles évalués par les pairs, revues de littérature, thèses, ouvrages) dans OpenAlex, revues indexées par défaut. Renvoie titre, auteurs, revue, année, citations et identifiant.",
      inputSchema: z.object({
        query: z.string().min(2).max(300).describe("Mots-clés, titre ou auteur"),
        year_from: z.number().int().min(1800).max(2100).optional(),
        year_to: z.number().int().min(1800).max(2100).optional(),
        open_access_only: z.boolean().optional().describe("Seulement les articles en accès ouvert"),
        sort: z.enum(["relevance", "cited", "recent"]).optional(),
        limit: z.number().int().min(1).max(15).optional().describe("Nombre de résultats (5 par défaut)"),
      }),
      annotations: { ...READ_ONLY, openWorldHint: true },
    },
    async ({ query, year_from, year_to, open_access_only, sort, limit }) => {
      const page = await searchWorks({
        q: query,
        yearFrom: year_from,
        yearTo: year_to,
        oaOnly: open_access_only,
        perPage: limit ?? 5,
        sort,
      });
      if (page.results.length === 0) return text(`Aucun résultat pour « ${query} ».`);
      return text(`${page.meta.count} résultats pour « ${query} » (les ${page.results.length} premiers) :\n\n${page.results.map(workLine).join("\n\n")}`);
    },
  );

  server.registerTool(
    "get_article",
    {
      title: "Lire la fiche d'un article",
      description: "Fiche complète d'un article : auteurs et institutions, revue, date, DOI, résumé, sujets, lien vers le texte en accès ouvert s'il existe, et référence APA.",
      inputSchema: z.object({ id: articleId }),
      annotations: { ...READ_ONLY, openWorldHint: true },
    },
    async ({ id }) => {
      const w = await getWork(id);
      if (!w) return text(`Article ${id} introuvable.`);
      const abstract = abstractFromInvertedIndex(w.abstract_inverted_index);
      const oa = openAccessUrl(w);
      const authors = w.authorships.slice(0, 15).map((a) => `${a.author.display_name}${a.institutions[0] ? ` (${a.institutions[0].display_name})` : ""}`).join(", ");
      return text(
        [
          `# ${workTitle(w)}`,
          `Auteurs : ${authors}${w.authorships.length > 15 ? ` et ${w.authorships.length - 15} autres` : ""}`,
          `Publication : ${venueName(w) ?? "—"}, ${w.publication_date ?? w.publication_year ?? "s. d."} — ${typeLabel(w.type)}${w.language ? ` — langue : ${w.language}` : ""}`,
          `Citations : ${w.cited_by_count}${w.doi ? ` — DOI : ${w.doi}` : ""}`,
          `Accès : ${oa ? `${w.open_access.is_oa ? "accès ouvert" : "lien"} ${oa.url}` : "pas de version libre connue"}`,
          w.topics?.length ? `Sujets : ${w.topics.slice(0, 3).map((t) => t.display_name).join(" ; ")}` : "",
          `Fiche Sextant : ${SITE.url}/article/${shortId(w.id)}`,
          "",
          `## Résumé`,
          abstract ?? "Résumé non disponible dans OpenAlex.",
          "",
          `## Référence APA`,
          toApa(w),
        ]
          .filter((l) => l !== "")
          .join("\n"),
      );
    },
  );

  server.registerTool(
    "get_related_articles",
    {
      title: "Articles proches",
      description: "Articles proches d'un article donné par le contenu (apparentés OpenAlex), complétés par les plus cités du même sujet.",
      inputSchema: z.object({ id: articleId, limit: z.number().int().min(1).max(15).optional() }),
      annotations: { ...READ_ONLY, openWorldHint: true },
    },
    async ({ id, limit }) => {
      const w = await getWork(id);
      if (!w) return text(`Article ${id} introuvable.`);
      const n = limit ?? 6;
      let similar = await getWorksByIds(w.related_works ?? []);
      if (similar.length < n && w.primary_topic) {
        const more = await getWorksBySameTopic(w.primary_topic.id, w.id, n);
        const seen = new Set(similar.map((x) => x.id));
        similar = [...similar, ...more.filter((x) => !seen.has(x.id))];
      }
      if (similar.length === 0) return text(`Pas d'article proche trouvé pour « ${workTitle(w)} ».`);
      return text(`Articles proches de « ${workTitle(w)} » :\n\n${similar.slice(0, n).map(workLine).join("\n\n")}`);
    },
  );

  server.registerTool(
    "get_my_favorites",
    {
      title: "Mes favoris",
      description: "Les articles enregistrés en favoris par l'utilisateur dans Sextant, du plus récent au plus ancien, filtrables par texte.",
      inputSchema: z.object({
        query: z.string().max(200).optional().describe("Filtre sur le titre, les auteurs, la revue ou le sujet"),
        limit: z.number().int().min(1).max(100).optional().describe("30 par défaut"),
      }),
      annotations: READ_ONLY,
    },
    async ({ query, limit }, ctx) => {
      const uid = uidOf(ctx as Ctx);
      const n = limit ?? 30;
      const q = query ? fold(query) : "";
      // Lectures bornées : sans filtre, seulement les `n` plus récents ; avec filtre, parcours par pages jusqu'à `n` résultats.
      const [shown, total] = await Promise.all([
        q ? findFavorites(uid, (f) => fold(`${f.title} ${f.authors} ${f.venue ?? ""} ${f.topic ?? ""}`).includes(q), n) : listFavorites(uid, n),
        countFavorites(uid),
      ]);
      if (shown.length === 0) return text(q ? `Aucun favori ne correspond à « ${query} ».` : "Aucun favori pour l'instant.");
      return text(`${total} favori(s) au total${q ? `, ${shown.length} pour « ${query} »` : ""} :\n\n${shown.map(favoriteLine).join("\n")}`);
    },
  );

  server.registerTool(
    "list_my_lists",
    {
      title: "Mes listes",
      description: "Les listes de l'utilisateur (par exemple « Mémoire 2026 ») avec leur description et leur nombre d'articles.",
      inputSchema: z.object({}),
      annotations: READ_ONLY,
    },
    async (_args, ctx) => {
      const lists = await listCollections(uidOf(ctx as Ctx));
      if (lists.length === 0) return text("Aucune liste pour l'instant.");
      return text(lists.map((l) => `- ${l.name} (${l.articleIds.length} article${l.articleIds.length > 1 ? "s" : ""}) — id ${l.id}${l.description ? `\n  ${l.description}` : ""}`).join("\n"));
    },
  );

  server.registerTool(
    "get_list",
    {
      title: "Contenu d'une liste",
      description: "Les articles d'une liste de l'utilisateur, dans l'ordre choisi, avec leurs références. Accepte l'identifiant ou le nom de la liste.",
      inputSchema: z.object({ list: z.string().min(1).max(100).describe("Identifiant ou nom de la liste") }),
      annotations: READ_ONLY,
    },
    async ({ list }, ctx) => {
      const uid = uidOf(ctx as Ctx);
      // Les listes (≤ 50 lectures), puis seulement les favoris de la liste trouvée, pas toute la bibliothèque.
      const lists = await listCollections(uid);
      const q = fold(list.trim());
      const found = lists.find((l) => l.id === list.trim()) ?? lists.find((l) => fold(l.name) === q) ?? lists.find((l) => fold(l.name).includes(q));
      if (!found) return text(`Aucune liste « ${list} ». Listes existantes : ${lists.map((l) => l.name).join(", ") || "aucune"}.`);
      const items: Favorite[] = await getFavoritesByIds(uid, found.articleIds);
      return text(
        [`# ${found.name}`, found.description, `${items.length} article(s) :`, "", ...items.map((f, i) => `${favoriteLine(f, i)}\n   APA : ${apaFromSnapshot(f)}`)].filter(Boolean).join("\n"),
      );
    },
  );

  server.registerTool(
    "get_my_citations",
    {
      title: "Mes citations",
      description: "Les passages que l'utilisateur a surlignés ou notés à la main, avec leur article, leur page et la référence APA prête à coller. Filtrables par article ou par texte.",
      inputSchema: z.object({
        article_id: articleId.optional(),
        query: z.string().max(200).optional().describe("Filtre sur le passage, la note ou le titre de l'article"),
        limit: z.number().int().min(1).max(100).optional().describe("30 par défaut"),
      }),
      annotations: READ_ONLY,
    },
    async ({ article_id, query, limit }, ctx) => {
      const uid = uidOf(ctx as Ctx);
      const n = limit ?? 30;
      const q = query ? fold(query) : "";
      const matches = (h: Highlight) => !q || fold(`${h.text} ${h.note} ${h.article.title}`).includes(q);
      // Lectures bornées : un article (≤ 200 passages), les `n` plus récents, ou un parcours par pages jusqu'à `n` résultats.
      const shown = article_id
        ? (await listHighlights(uid, shortId(article_id).toUpperCase(), MAX_ARTICLE_HIGHLIGHTS)).filter(matches).slice(0, n)
        : q
          ? await findHighlights(uid, matches, n)
          : await listHighlights(uid, undefined, n);
      if (shown.length === 0) return text("Aucune citation ne correspond.");
      return text(
        shown
          .map((h, i) => `${i + 1}. ${citationBlock(h)}\n   Source : ${sourceLabel(h)} — article ${h.workId}${h.note ? `\n   Note : ${h.note}` : ""}`)
          .join("\n\n"),
      );
    },
  );

  server.registerTool(
    "get_my_notes",
    {
      title: "Mes notes",
      description: "Les notes personnelles de l'utilisateur sur des articles (ce qu'il en retient). Sans article précisé : les plus récentes.",
      inputSchema: z.object({ article_id: articleId.optional(), limit: z.number().int().min(1).max(100).optional() }),
      annotations: READ_ONLY,
    },
    async ({ article_id, limit }, ctx) => {
      const uid = uidOf(ctx as Ctx);
      if (article_id) {
        const note = await getNote(uid, shortId(article_id).toUpperCase());
        return text(note ? `Note sur « ${note.article.title} » :\n\n${note.text}` : `Pas de note sur l'article ${article_id}.`);
      }
      const notes = await listNotes(uid, limit ?? 30);
      if (notes.length === 0) return text("Aucune note pour l'instant.");
      return text(notes.map((n) => `## ${n.article.title} (${n.article.year ?? "s. d."}) — ${n.workId}\n${n.text}`).join("\n\n"));
    },
  );
}
