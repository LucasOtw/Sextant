import { shortId } from "@/lib/ids";

/**
 * Thématiques mises en avant. Chaque entrée pointe vers un "field" OpenAlex
 * (26 au total) — on en expose une sélection lisible, en français.
 */
export interface Theme {
  slug: string;
  fieldId: string;
  name: string;
  description: string;
  /** Classe Tailwind pour la pastille de couleur (repère visuel de chaque thématique, voulu par Lucas le 29/09). */
  tone: string;
}

export const THEMES: Theme[] = [
  { slug: "informatique", fieldId: "17", name: "Informatique", description: "IA, systèmes, réseaux, interaction humain-machine.", tone: "bg-sky-500" },
  { slug: "medecine", fieldId: "27", name: "Médecine", description: "Clinique, santé publique, épidémiologie.", tone: "bg-rose-500" },
  { slug: "psychologie", fieldId: "32", name: "Psychologie", description: "Cognition, développement, psychologie sociale.", tone: "bg-violet-500" },
  { slug: "sciences-sociales", fieldId: "33", name: "Sciences sociales", description: "Sociologie, éducation, science politique.", tone: "bg-amber-500" },
  { slug: "economie", fieldId: "20", name: "Économie & finance", description: "Macro, micro, économétrie, marchés.", tone: "bg-emerald-600" },
  { slug: "gestion", fieldId: "14", name: "Gestion & management", description: "Stratégie, marketing, organisation, comptabilité.", tone: "bg-teal-500" },
  { slug: "neurosciences", fieldId: "28", name: "Neurosciences", description: "Cerveau, cognition, neuro-imagerie.", tone: "bg-fuchsia-500" },
  { slug: "biologie", fieldId: "13", name: "Biologie & génétique", description: "Biochimie, génomique, biologie moléculaire.", tone: "bg-lime-600" },
  { slug: "environnement", fieldId: "23", name: "Environnement", description: "Climat, écologie, pollution, ressources.", tone: "bg-green-600" },
  { slug: "ingenierie", fieldId: "22", name: "Ingénierie", description: "Mécanique, électronique, génie civil.", tone: "bg-orange-500" },
  { slug: "physique", fieldId: "31", name: "Physique & astronomie", description: "Matière, particules, cosmologie.", tone: "bg-indigo-500" },
  { slug: "mathematiques", fieldId: "26", name: "Mathématiques", description: "Analyse, algèbre, statistiques, optimisation.", tone: "bg-slate-500" },
  { slug: "humanites", fieldId: "12", name: "Arts & humanités", description: "Histoire, philosophie, littérature, arts.", tone: "bg-yellow-600" },
  { slug: "sciences-de-la-terre", fieldId: "19", name: "Sciences de la Terre", description: "Géologie, océans, atmosphère, planètes.", tone: "bg-stone-500" },
  { slug: "chimie", fieldId: "16", name: "Chimie", description: "Synthèse, analyse, matériaux moléculaires.", tone: "bg-cyan-600" },
  { slug: "energie", fieldId: "21", name: "Énergie", description: "Renouvelables, stockage, réseaux, efficacité.", tone: "bg-red-500" },
];

export function themeBySlug(slug: string): Theme | undefined {
  return THEMES.find((t) => t.slug === slug);
}

export function themeByFieldId(fieldId: string): Theme | undefined {
  const id = fieldId.replace(/^.*fields\//, "");
  return THEMES.find((t) => t.fieldId === id);
}

/** Description de la page d'un thème (balise meta et aperçus de partage), distincte de celle du site (QUAL-18). */
export function themeMetaDescription(theme: Theme): string {
  return `${theme.name} : ${theme.description} Les articles les plus cités de l'année, et une recherche limitée à cette discipline.`;
}

/**
 * Adresse canonique d'une page de thème (QUAL-18) : ?q, ?sort, ?from… en sont des variantes de la même page, mais pas
 * ?page=2 ni ?topic=T…, qui listent d'autres articles (les pastilles de sujet sont des liens explorables). Sujet et
 * numéro de page sont donc gardés, pour que Google parcoure ces listes au lieu d'ignorer une canonique qui désignerait
 * une autre liste (/search est exclu par robots.txt : les thèmes sont le chemin de découverte des articles).
 */
export function themeCanonical(slug: string, page: number | undefined, topic?: string): string {
  const params = new URLSearchParams();
  if (topic) params.set("topic", topic);
  if (page && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/theme/${slug}?${query}` : `/theme/${slug}`;
}

/**
 * Métadonnées d'une page de thème : titre (sans le numéro de page), description et adresse canonique. Filtrée par un
 * sujet (?topic), la page est canonique d'elle-même (`themeCanonical`) : elle porte alors le nom du sujet dans son
 * titre et sa description, sans quoi ses pages seraient des doublons de celles du thème pour les moteurs.
 * `topics` : les sujets du domaine (ceux des pastilles) ; `null` si la liste n'a pas pu être lue (OpenAlex en panne),
 * la canonique garde alors le sujet. Sujet absent de la liste (hors du domaine) : canonique vers le thème.
 */
export function themePageMeta(
  theme: Theme,
  page: number | undefined,
  topic: string | undefined,
  topics: readonly { id: string; display_name: string }[] | null,
): { name: string; description: string; canonical: string } {
  const base = { name: theme.name, description: themeMetaDescription(theme) };
  if (!topic) return { ...base, canonical: themeCanonical(theme.slug, page) };
  if (topics === null) return { ...base, canonical: themeCanonical(theme.slug, page, topic) };
  const topicName = topics.find((t) => shortId(t.id) === topic)?.display_name.trim();
  if (!topicName) return { ...base, canonical: `/theme/${theme.slug}` };
  return {
    name: `${topicName} — ${theme.name}`,
    description: `Les articles les plus cités sur « ${topicName} » (${theme.name}), et une recherche limitée à ce sujet.`,
    canonical: themeCanonical(theme.slug, page, topic),
  };
}
