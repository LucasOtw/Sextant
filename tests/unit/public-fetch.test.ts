import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Résolveur DNS simulé : aucun test ne sort sur le réseau. `resolve` décide des adresses renvoyées pour un nom.
type Resolved = { address: string; family: number }[];
const dnsState = vi.hoisted(() => ({ resolve: ((): Resolved => []) as (host: string) => Resolved }));
vi.mock("node:dns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns")>();
  const lookup = (host: string, _opts: unknown, cb: (err: Error | null, addrs: { address: string; family: number }[]) => void) => {
    queueMicrotask(() => cb(null, dnsState.resolve(host)));
  };
  return { ...actual, default: { ...actual, lookup }, lookup };
});

const { fetchPublic, followRedirects, isPublicAddress, NonPublicAddressError, safeLookup } = await import("@/lib/public-fetch");
const { isPublicPdfUrl } = await import("@/lib/format");

describe("isPublicAddress (adresses IP résolues pour le relais PDF)", () => {
  it.each(["8.8.8.8", "1.1.1.1", "140.82.112.3", "2606:4700:4700::1111", "2a00:1450:4007:80e::200e", "::ffff:8.8.8.8", "64:ff9b::9765:c32a", "64:ff9b::151.101.195.42"])("accepte %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it.each([
    ["boucle locale IPv4", "127.0.0.1"],
    ["boucle locale IPv4 (hors .1)", "127.10.20.30"],
    ["« ce réseau »", "0.0.0.0"],
    ["privé 10/8", "10.1.2.3"],
    ["privé 172.16/12", "172.31.255.255"],
    ["privé 192.168/16", "192.168.1.1"],
    ["NAT opérateur 100.64/10", "100.64.0.1"],
    ["lien local (métadonnées cloud)", "169.254.169.254"],
    ["bancs d'essai 198.18/15", "198.19.0.1"],
    ["multidiffusion", "224.0.0.1"],
    ["diffusion générale", "255.255.255.255"],
    ["IPv6 non spécifiée", "::"],
    ["IPv6 boucle locale", "::1"],
    ["IPv6 unique locale fc00::/7", "fd12:3456::1"],
    ["IPv6 lien local", "fe80::1"],
    ["IPv6 multidiffusion", "ff02::1"],
    ["IPv4 mappée vers la boucle locale", "::ffff:127.0.0.1"],
    ["IPv4 mappée (forme hexadécimale)", "::ffff:7f00:1"],
    ["NAT64 vers la boucle locale", "64:ff9b::7f00:1"],
    ["NAT64 vers un réseau privé (forme pointée)", "64:ff9b::10.0.0.1"],
    ["NAT64 à usage local", "64:ff9b:1::a00:1"],
    ["6to4", "2002:7f00:1::1"],
    ["pas une IP", "localhost"],
    ["chaîne vide", ""],
  ])("refuse : %s", (_label, ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
});

describe("safeLookup (contrôle DNS au moment de la connexion)", () => {
  const lookupAsync = (host: string, all: boolean) =>
    new Promise<{ err: NodeJS.ErrnoException | null; address: unknown; family?: number }>((resolve) =>
      safeLookup(host, { all }, (err, address, family) => resolve({ err, address, family })),
    );

  it("refuse un nom public qui résout vers la boucle locale (DNS joker du type 127.0.0.1.nip.io)", async () => {
    dnsState.resolve = () => [{ address: "127.0.0.1", family: 4 }];
    const { err } = await lookupAsync("127.0.0.1.nip.io", false);
    expect(err).toBeInstanceOf(NonPublicAddressError);
  });

  it("ne garde que les adresses publiques d'une réponse mélangée", async () => {
    dnsState.resolve = () => [
      { address: "10.0.0.5", family: 4 },
      { address: "fe80::21a:4aff:fe31:109c", family: 6 },
      { address: "93.184.216.34", family: 4 },
    ];
    expect(await lookupAsync("melange.example.org", false)).toEqual({ err: null, address: "93.184.216.34", family: 4 });
    expect((await lookupAsync("melange.example.org", true)).address).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });

  it("refuse si aucune adresse résolue n'est publique", async () => {
    dnsState.resolve = () => [
      { address: "10.0.0.5", family: 4 },
      { address: "::1", family: 6 },
    ];
    expect((await lookupAsync("interne.example.org", true)).err).toBeInstanceOf(NonPublicAddressError);
  });

  it("refuse une résolution IPv6 privée", async () => {
    dnsState.resolve = () => [{ address: "fd00::1", family: 6 }];
    expect((await lookupAsync("v6.example.org", false)).err).toBeInstanceOf(NonPublicAddressError);
  });

  it("accepte des adresses publiques, au format demandé par node:http (une adresse ou la liste)", async () => {
    dnsState.resolve = () => [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ];
    expect(await lookupAsync("example.org", false)).toEqual({ err: null, address: "93.184.216.34", family: 4 });
    const all = await lookupAsync("example.org", true);
    expect(all.err).toBeNull();
    expect(all.address).toHaveLength(2);
  });
});

/** Un saut simulé : statut, en-têtes et un corps dont on sait s'il a été libéré. */
function fakeHop(status: number, headers: Record<string, string> = {}) {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode("%PDF-1.7"));
    },
    cancel() {
      cancelled = true;
    },
  });
  return { hop: { status, headers: new Headers(headers), body }, wasCancelled: () => cancelled };
}

describe("followRedirects (chaque redirection validée avant d'être demandée)", () => {
  it("suit une redirection vers un dépôt public et renvoie l'adresse finale", async () => {
    const first = fakeHop(302, { location: "https://hal.science/hal-1/document" });
    const final = fakeHop(200, { "content-type": "application/pdf" });
    const hop = vi.fn().mockResolvedValueOnce(first.hop).mockResolvedValueOnce(final.hop);
    const res = await followRedirects("https://doi.example.org/x", isPublicPdfUrl, 5, hop);
    expect(res).toMatchObject({ url: "https://hal.science/hal-1/document", status: 200, ok: true });
    expect(hop).toHaveBeenCalledTimes(2);
    expect(first.wasCancelled()).toBe(true);
  });

  it("résout une redirection relative par rapport à l'adresse courante", async () => {
    const hop = vi.fn().mockResolvedValueOnce(fakeHop(301, { location: "/pdf/1.pdf" }).hop).mockResolvedValueOnce(fakeHop(200).hop);
    const res = await followRedirects("https://arxiv.org/abs/1", isPublicPdfUrl, 5, hop);
    expect(hop).toHaveBeenLastCalledWith("https://arxiv.org/pdf/1.pdf");
    expect(res?.url).toBe("https://arxiv.org/pdf/1.pdf");
  });

  it.each([
    ["la boucle locale (API d'exécution Lambda)", "http://127.0.0.1:9001/2018-06-01/runtime/invocation/next"],
    ["les métadonnées cloud", "http://169.254.169.254/latest/meta-data/"],
    ["localhost avec point final", "http://localhost./a.pdf"],
    ["un port exotique", "https://depot.example.org:8443/a.pdf"],
    ["IPv6 de bouclage", "http://[::1]/a.pdf"],
    ["IPv4 mappée", "http://[::ffff:127.0.0.1]/a.pdf"],
    ["un schéma non http(s)", "file:///etc/passwd"],
  ])("ne demande jamais une redirection vers %s", async (_label, location) => {
    const first = fakeHop(302, { location });
    const hop = vi.fn().mockResolvedValueOnce(first.hop);
    expect(await followRedirects("https://depot.example.org/a.pdf", isPublicPdfUrl, 5, hop)).toBeNull();
    expect(hop).toHaveBeenCalledTimes(1);
    expect(first.wasCancelled()).toBe(true);
  });

  it("refuse l'adresse de départ si elle n'est pas publique, sans rien demander", async () => {
    const hop = vi.fn();
    expect(await followRedirects("http://10.0.0.1/a.pdf", isPublicPdfUrl, 5, hop)).toBeNull();
    expect(hop).not.toHaveBeenCalled();
  });

  it("abandonne au-delà du nombre maximal de redirections", async () => {
    const hop = vi.fn().mockImplementation(async (url: string) => fakeHop(302, { location: `${url}x` }).hop);
    expect(await followRedirects("https://boucle.example.org/a", isPublicPdfUrl, 5, hop)).toBeNull();
    expect(hop).toHaveBeenCalledTimes(6);
  });

  it("rend telle quelle une réponse 3xx sans Location, et une erreur (non « ok »)", async () => {
    const res = await followRedirects("https://depot.example.org/a.pdf", isPublicPdfUrl, 5, vi.fn().mockResolvedValueOnce(fakeHop(302).hop));
    expect(res).toMatchObject({ status: 302, ok: false });
    const err = await followRedirects("https://depot.example.org/a.pdf", isPublicPdfUrl, 5, vi.fn().mockResolvedValueOnce(fakeHop(403).hop));
    expect(err).toMatchObject({ status: 403, ok: false });
  });
});

describe("fetchPublic (transport réel, DNS simulé)", () => {
  let server: http.Server;
  let port = 0;
  let hits = 0;

  beforeEach(async () => {
    hits = 0;
    server = http.createServer((_req, res) => {
      hits++;
      res.end("%PDF-1.7 secret interne");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("DNS rebinding : un nom qui résout vers 127.0.0.1 est refusé avant toute connexion", async () => {
    dnsState.resolve = () => [{ address: "127.0.0.1", family: 4 }];
    // Le port est celui du serveur local : seul le contrôle DNS l'empêche de répondre (le filtre d'adresse est levé ici).
    const request = fetchPublic(`http://depot-piege.example.org:${port}/a.pdf`, {
      headers: {},
      signal: AbortSignal.timeout(5_000),
      isAllowed: () => true,
    });
    await expect(request).rejects.toBeInstanceOf(NonPublicAddressError);
    expect(hits).toBe(0);
  });

  it("une IP littérale privée est refusée même si le filtre d'adresse la laissait passer", async () => {
    const request = fetchPublic(`http://127.0.0.1:${port}/a.pdf`, { headers: {}, signal: AbortSignal.timeout(5_000), isAllowed: () => true });
    await expect(request).rejects.toBeInstanceOf(NonPublicAddressError);
    expect(hits).toBe(0);
  });
});
