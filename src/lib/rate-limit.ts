import "server-only";

/**
 * Limitation de débit minimale, en mémoire, par clé (identifiant utilisateur) et par instance serveur.
 * Suffisante pour freiner un script qui boucle ; ce n'est pas une protection globale.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Intervalle du ménage des compteurs expirés : une clé (adresse IP ou compte) ne survit pas longtemps à sa fenêtre. */
const SWEEP_MS = 60_000;
let lastSweep = 0;

/** Retire les compteurs dont la fenêtre est terminée ; renvoie combien il en reste. */
export function sweepExpired(now = Date.now()): number {
  lastSweep = now;
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  return buckets.size;
}

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  // Ménage au plus une fois par minute, et dès que la table grossit : un compteur n'est gardé que le temps de sa
  // fenêtre (une heure au plus, cf. RATE_LIMITS), plus une minute, tant que l'instance reçoit des requêtes.
  if (now - lastSweep >= SWEEP_MS || buckets.size > 10_000) sweepExpired(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count++;
  return b.count <= limit;
}

/** IP du client telle que transmise par Vercel (premier élément de `x-forwarded-for`), ou « anon ». */
export function clientIp(source: Request | Headers): string {
  const headers = source instanceof Headers ? source : source.headers;
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
}
