/**
 * Thématiques mises en avant. Chaque entrée pointe vers un "field" OpenAlex
 * (26 au total) — on en expose une sélection lisible, en français.
 */
export interface Theme {
  slug: string;
  fieldId: string;
  name: string;
  description: string;
  /** Classe Tailwind pour la pastille de couleur. */
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
