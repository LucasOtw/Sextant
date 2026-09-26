/**
 * Requêtes partielles du lecteur PDF (PERF-06), partagées par le relais /api/pdf et le lecteur. Pur, sans import serveur.
 *
 * Le lecteur télécharge le PDF en entier comme avant, mais le confie à PDF.js au fil de l'eau : PDF.js demande alors par
 * plages ce qui lui manque pour afficher la première page (la table de fin de fichier, les objets de la page), sans
 * attendre la fin du téléchargement. Une plage n'est lue que chez la copie qui a servi le fichier entier (index de
 * candidat renvoyé par le relais), et vérifiée à l'arrivée (début, fin, taille totale) : jamais d'octets d'un autre
 * fichier mélangés au document. Une plage refusée ou non conforme est simplement ignorée : le téléchargement complet,
 * qui continue, finit par apporter les mêmes octets.
 */

/** Plus grosse plage relayée (PDF.js demande des morceaux de 64 Ko, regroupés au besoin ; au-delà, voir `splitRange`). */
export const MAX_RANGE_BYTES = 4 * 1024 * 1024;
/** En dessous, le fichier entier arrive assez vite : pas de requêtes partielles (chacune coûte une invocation). */
export const RANGE_MIN_TOTAL_BYTES = 2 * 1024 * 1024;

/** Taille des morceaux de PDF.js : les tranches d'une grande demande sont coupées sur ces frontières. */
export const RANGE_ALIGN_BYTES = 64 * 1024;
/** Tranches d'une même demande lues en même temps, au plus. */
export const RANGE_PARALLEL = 4;

/** `bytes=a-b` : un seul intervalle fermé, borné à MAX_RANGE_BYTES. Rien d'autre (suffixe, intervalles multiples). */
export function parseRange(header: string | null): { start: number; end: number } | null {
  const m = /^bytes=(\d{1,12})-(\d{1,12})$/.exec(header?.trim() ?? "");
  if (!m) return null;
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (end < start || end - start + 1 > MAX_RANGE_BYTES) return null;
  return { start, end };
}

/** `bytes a-b/total` (taille totale connue), cohérent ; sinon null. */
export function parseContentRange(header: string | null): { start: number; end: number; total: number } | null {
  const m = /^bytes (\d{1,12})-(\d{1,12})\/(\d{1,12})$/.exec(header?.trim() ?? "");
  if (!m) return null;
  const [start, end, total] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (end < start || end >= total) return null;
  return { start, end, total };
}

/**
 * La réponse de l'hébergeur à `bytes=start-end` est-elle exactement la plage voulue ? Elle peut s'arrêter avant `end`
 * seulement à la fin du fichier.
 */
export function isExpectedRange(cr: { start: number; end: number; total: number } | null, start: number, end: number): boolean {
  if (!cr || cr.start !== start) return false;
  return cr.end === end || (cr.end < end && cr.end === cr.total - 1);
}

/**
 * Découpe la demande [begin, end[ de PDF.js en tranches d'au plus `max` octets, coupées sur des multiples de 64 Ko.
 * PDF.js regroupe les morceaux contigus manquants en une seule demande, sans plafond (une image de plus de 4 Mo sur
 * la première page suffit) : sans découpe, le relais la refuserait (416) et la page attendrait le fichier entier.
 */
export function splitRange(begin: number, end: number, max = MAX_RANGE_BYTES): [number, number][] {
  const slices: [number, number][] = [];
  let b = begin;
  while (b < end) {
    let e = Math.min(end, b + max);
    if (e < end) {
      const aligned = Math.floor(e / RANGE_ALIGN_BYTES) * RANGE_ALIGN_BYTES;
      if (aligned > b) e = aligned;
    }
    slices.push([b, e]);
    b = e;
  }
  return slices;
}

/**
 * Lit [begin, end[ par tranches (`splitRange`), au plus RANGE_PARALLEL à la fois, et renvoie les octets réunis : le
 * lecteur de plages de PDF.js attend un seul morceau pour ce `begin`. Une tranche en échec fait tout abandonner (null) :
 * la demande est alors ignorée, comme une plage refusée, et le téléchargement complet apportera les octets.
 */
export async function fetchInSlices(begin: number, end: number, fetchSlice: (begin: number, end: number) => Promise<Uint8Array | null>, max = MAX_RANGE_BYTES): Promise<Uint8Array | null> {
  const slices = splitRange(begin, end, max);
  const parts: Uint8Array[] = new Array(slices.length);
  let next = 0;
  let failed = false;
  const lane = async () => {
    while (!failed && next < slices.length) {
      const i = next++;
      const part = await fetchSlice(slices[i][0], slices[i][1]);
      if (!part) failed = true;
      else parts[i] = part;
    }
  };
  await Promise.all(Array.from({ length: Math.min(RANGE_PARALLEL, slices.length) }, lane));
  if (failed) return null;
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(end - begin);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/**
 * Corps relayé d'une plage, borné à `expected` octets (la longueur annoncée au client) : un hébergeur défaillant qui
 * répond 206 avec le bon Content-Range mais un corps plus long (fichier entier, octets en trop) est tronqué, jamais
 * relayé au-delà ni refusé alors que les octets utiles sont arrivés ; l'amont est libéré dès la plage complète. Un corps
 * plus court qu'annoncé fait échouer la réponse (le lecteur ignore alors la plage). `first` : premier morceau déjà lu.
 */
export function boundedRangeBody(reader: ReadableStreamDefaultReader<Uint8Array>, first: ReadableStreamReadResult<Uint8Array>, expected: number): ReadableStream<Uint8Array> {
  let sent = 0;
  /** Met en file la part utile du morceau ; vrai quand la plage est complète. */
  const push = (controller: ReadableStreamDefaultController<Uint8Array>, value: Uint8Array): boolean => {
    const room = expected - sent;
    const part = value.byteLength > room ? value.subarray(0, room) : value;
    if (part.byteLength > 0) controller.enqueue(part);
    sent += part.byteLength;
    if (sent < expected) return false;
    controller.close();
    reader.cancel().catch(() => undefined);
    return true;
  };
  const ended = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (sent < expected) controller.error(new Error("Plage plus courte qu'annoncé."));
    else controller.close();
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (first.done || !first.value) return ended(controller);
      push(controller, first.value);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) return ended(controller);
      push(controller, value);
    },
    cancel() {
      return reader.cancel();
    },
  });
}
