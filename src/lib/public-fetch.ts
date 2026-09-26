import "server-only";
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { pipeline, Readable } from "node:stream";
import zlib from "node:zlib";

/**
 * Requêtes sortantes vers des adresses venues de l'extérieur (liens PDF moissonnés par OpenAlex) : jamais vers la
 * boucle locale ni un réseau privé (SSRF). Trois verrous, à chaque saut :
 * 1. l'adresse elle-même (schéma, port, nom d'hôte) passe le filtre fourni par l'appelant (`isPublicPdfUrl`) ;
 * 2. les adresses IP résolues par le DNS sont toutes publiques, contrôlées au moment même de la connexion (option
 *    `lookup` de node:http) : pas de fenêtre entre contrôle et connexion, donc pas de DNS rebinding ;
 * 3. les redirections ne sont jamais suivies automatiquement : chaque `Location` repasse par 1 et 2.
 */

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], // « ce réseau »
  ["10.0.0.0", 8], // privé
  ["100.64.0.0", 10], // NAT des opérateurs
  ["127.0.0.0", 8], // boucle locale
  ["169.254.0.0", 16], // lien local (métadonnées des clouds)
  ["172.16.0.0", 12], // privé
  ["192.0.0.0", 24], // IETF
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // relais 6to4
  ["192.168.0.0", 16], // privé
  ["198.18.0.0", 15], // bancs d'essai
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multidiffusion
  ["240.0.0.0", 4], // réservé, diffusion générale
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128], // non spécifiée
  ["::1", 128], // boucle locale
  ["64:ff9b:1::", 48], // NAT64 local
  ["100::", 64], // rebut
  ["2001::", 32], // Teredo : IPv4 embarquée
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4 : IPv4 embarquée
  ["fc00::", 7], // adresses uniques locales (privé)
  ["fe80::", 10], // lien local
  ["fec0::", 10], // site local (obsolète)
  ["ff00::", 8], // multidiffusion
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/**
 * Une adresse IP joignable sur Internet (ni privée, ni locale, ni réservée) ; `false` pour ce qui n'est pas une IP.
 * Les IPv4 mappées (`::ffff:127.0.0.1`, `::ffff:7f00:1`) sont confrontées aux règles IPv4 par BlockList lui-même.
 */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return !blocked.check(ip, "ipv4");
  if (family !== 6) return false;
  // NAT64 (préfixe bien connu 64:ff9b::/96, réseaux IPv6 seuls avec DNS64) : la passerelle joint l'IPv4 embarquée,
  // c'est donc elle qu'on juge (64:ff9b::7f00:1 = 127.0.0.1, refusée ; 64:ff9b::9765:c32a = 151.101.195.42, acceptée).
  const words = ipv6Words(ip);
  if (words && words[0] === 0x64 && words[1] === 0xff9b && words.slice(2, 6).every((w) => w === 0)) {
    return isPublicAddress([words[6] >> 8, words[6] & 0xff, words[7] >> 8, words[7] & 0xff].join("."));
  }
  return !blocked.check(ip, "ipv6");
}

/** Les 8 mots de 16 bits d'une IPv6 valide (forme abrégée « :: » et IPv4 finale « ::ffff:1.2.3.4 » comprises). */
function ipv6Words(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/%.*$/, "");
  const dotted = s.match(/^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(2).map(Number);
    s = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = s.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const missing = 8 - left.length - right.length;
  if (s.includes("::") ? missing < 1 : missing !== 0) return null;
  return [...left, ...Array(s.includes("::") ? missing : 0).fill("0"), ...right].map((h) => parseInt(h, 16));
}

/** Erreur d'une adresse refusée (non publique) : le relais passe simplement à la copie suivante. */
export class NonPublicAddressError extends Error {
  readonly code = "ENOTPUBLIC";
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * `lookup` pour node:http : résout toutes les adresses du nom et ne garde que les publiques ; aucune → refus. La
 * connexion ne peut se faire que sur une adresse ainsi contrôlée : c'est ce qui ferme la porte au DNS rebinding.
 * (Filtrer plutôt que tout refuser : certains résolveurs ajoutent une adresse de lien local à une réponse publique.)
 */
export function safeLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = (addresses as LookupAddress[]).filter((a) => isPublicAddress(a.address));
    if (list.length === 0) return callback(new NonPublicAddressError(`Adresse non publique pour ${hostname}.`), []);
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

/** Réponse relayable : l'adresse finale (après redirections), le statut, les en-têtes et le corps décompressé. */
export interface PublicResponse {
  url: string;
  status: number;
  ok: boolean;
  headers: Headers;
  body: ReadableStream<Uint8Array>;
}

/** Un saut : la réponse brute d'une adresse, sans suivre de redirection. `cancel` libère la connexion. */
export interface Hop {
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array>;
}

interface FetchInit {
  headers: Record<string, string>;
  signal: AbortSignal;
  /** Filtre appliqué à l'adresse de départ et à chaque redirection (schéma, port, nom d'hôte). */
  isAllowed: (url: string) => boolean;
  maxRedirects?: number;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/**
 * Suit au plus `maxRedirects` redirections, en validant chaque adresse avant de la demander. `null` si une adresse
 * est refusée ou si les redirections s'enchaînent trop. Séparé du transport pour être testé sans réseau.
 */
export async function followRedirects(
  start: string,
  isAllowed: (url: string) => boolean,
  maxRedirects: number,
  hop: (url: string) => Promise<Hop>,
): Promise<PublicResponse | null> {
  let current = start;
  for (let i = 0; i <= maxRedirects; i++) {
    if (!isAllowed(current)) return null;
    const res = await hop(current);
    const location = res.headers.get("location");
    if (!REDIRECTS.has(res.status) || !location) {
      return { url: current, status: res.status, ok: res.status >= 200 && res.status < 300, headers: res.headers, body: res.body };
    }
    await res.body.cancel().catch(() => undefined);
    try {
      current = new URL(location, current).href;
    } catch {
      return null;
    }
  }
  return null;
}

function toHeaders(raw: IncomingMessage["headers"]): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) headers.append(name, v);
  }
  return headers;
}

/** Corps décompressé si l'hébergeur a compressé malgré `accept-encoding: identity` (comme le faisait `fetch`). */
function decoded(res: IncomingMessage): Readable {
  const encoding = (res.headers["content-encoding"] ?? "identity").toLowerCase();
  const decoder =
    encoding === "gzip" || encoding === "x-gzip"
      ? zlib.createGunzip()
      : encoding === "deflate"
        ? zlib.createInflate()
        : encoding === "br"
          ? zlib.createBrotliDecompress()
          : null;
  if (!decoder) return res;
  return pipeline(res, decoder, () => undefined);
}

/** Un saut réel : GET HTTP(S) sans redirection automatique, connexion sur une adresse contrôlée par `safeLookup`. */
function requestHop(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    // Une IP littérale ne passe pas par `lookup` : contrôlée ici (le filtre d'adresse la refuse déjà, double verrou).
    const literal = target.hostname.replace(/^\[|\]$/g, "");
    if (isIP(literal) && !isPublicAddress(literal)) return reject(new NonPublicAddressError(`Adresse non publique : ${literal}.`));
    const client = target.protocol === "https:" ? https : http;
    const req = client.request(target, { method: "GET", headers, signal, lookup: safeLookup }, (res) => {
      resolve({ status: res.statusCode ?? 0, headers: toHeaders(res.headers), body: Readable.toWeb(decoded(res)) as ReadableStream<Uint8Array> });
    });
    req.on("error", reject);
    req.end();
  });
}

/** GET vers une adresse externe, redirections validées une à une (5 au plus), jamais vers l'intérieur. */
export function fetchPublic(url: string, init: FetchInit): Promise<PublicResponse | null> {
  return followRedirects(url, init.isAllowed, init.maxRedirects ?? 5, (u) => requestHop(u, init.headers, init.signal));
}
