import "server-only";

/**
 * Limitation de débit minimale, en mémoire, par clé (identifiant utilisateur) et par instance serveur.
 * Suffisante pour freiner un script qui boucle ; ce n'est pas une protection globale.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
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
