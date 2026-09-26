import { describe, expect, it } from "vitest";
import { boundedRangeBody, fetchInSlices, isExpectedRange, MAX_RANGE_BYTES, parseContentRange, parseRange, RANGE_ALIGN_BYTES, RANGE_PARALLEL, splitRange } from "@/lib/pdf-range";

describe("plages du lecteur PDF (PERF-06)", () => {
  it("parseRange : un seul intervalle fermé, borné", () => {
    expect(parseRange("bytes=0-65535")).toEqual({ start: 0, end: 65535 });
    expect(parseRange(" bytes=100-100 ")).toEqual({ start: 100, end: 100 });
    expect(parseRange(`bytes=0-${MAX_RANGE_BYTES - 1}`)).toEqual({ start: 0, end: MAX_RANGE_BYTES - 1 });
  });

  it("parseRange : refuse suffixe, intervalle ouvert, multiple, inversé ou trop grand", () => {
    for (const h of [null, "", "bytes=-500", "bytes=500-", "bytes=0-1,5-9", "bytes=10-5", `bytes=0-${MAX_RANGE_BYTES}`, "items=0-5", "bytes=a-b"]) {
      expect(parseRange(h), String(h)).toBeNull();
    }
  });

  it("parseContentRange : taille totale connue et bornes cohérentes", () => {
    expect(parseContentRange("bytes 0-1023/2215244")).toEqual({ start: 0, end: 1023, total: 2215244 });
    for (const h of [null, "bytes 0-1023/*", "bytes */2215244", "bytes 10-5/100", "bytes 0-100/100", "0-10/100"]) expect(parseContentRange(h), String(h)).toBeNull();
  });

  it("isExpectedRange : exactement la plage voulue, ou tronquée à la fin du fichier seulement", () => {
    expect(isExpectedRange({ start: 0, end: 65535, total: 1_000_000 }, 0, 65535)).toBe(true);
    expect(isExpectedRange({ start: 999_900, end: 999_999, total: 1_000_000 }, 999_900, 1_065_435)).toBe(true);
    expect(isExpectedRange({ start: 0, end: 1023, total: 1_000_000 }, 0, 65535)).toBe(false);
    expect(isExpectedRange({ start: 65536, end: 131071, total: 1_000_000 }, 0, 65535)).toBe(false);
    expect(isExpectedRange(null, 0, 65535)).toBe(false);
  });
});

describe("demande de plus de 4 Mo : lecture par tranches (PERF-06)", () => {
  it("splitRange : tranches d'au plus 4 Mo, coupées sur 64 Ko, qui couvrent exactement la demande", () => {
    const begin = 3 * RANGE_ALIGN_BYTES + 100;
    const end = begin + 9 * 1024 * 1024 + 17;
    const slices = splitRange(begin, end);
    expect(slices[0][0]).toBe(begin);
    expect(slices.at(-1)![1]).toBe(end);
    for (let i = 0; i < slices.length; i++) {
      const [b, e] = slices[i];
      expect(e - b).toBeLessThanOrEqual(MAX_RANGE_BYTES);
      expect(parseRange(`bytes=${b}-${e - 1}`)).not.toBeNull();
      if (i > 0) expect(b).toBe(slices[i - 1][1]);
      if (i < slices.length - 1) expect(e % RANGE_ALIGN_BYTES).toBe(0);
    }
    expect(splitRange(0, 65_536)).toEqual([[0, 65_536]]);
  });

  it("fetchInSlices : tranches lues en parallèle (bornées), réunies en un seul morceau dans l'ordre", async () => {
    const begin = 1000;
    const end = begin + 10 * 1024 * 1024;
    let running = 0;
    let peak = 0;
    const seen: [number, number][] = [];
    const out = await fetchInSlices(begin, end, async (b, e) => {
      seen.push([b, e]);
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      running--;
      // Chaque octet vaut sa position modulo 251 : l'ordre de réunion est vérifiable.
      return Uint8Array.from({ length: e - b }, (_, k) => (b + k) % 251);
    });
    expect(seen.length).toBe(3);
    expect(peak).toBeLessThanOrEqual(RANGE_PARALLEL);
    expect(out!.length).toBe(end - begin);
    for (const k of [0, 4 * 1024 * 1024, out!.length - 1]) expect(out![k]).toBe((begin + k) % 251);
  });

  it("fetchInSlices : une tranche refusée fait ignorer toute la demande", async () => {
    let calls = 0;
    const out = await fetchInSlices(0, 9 * 1024 * 1024, async (b, e) => (++calls === 2 ? null : new Uint8Array(e - b)));
    expect(out).toBeNull();
  });
});

describe("relais : corps borné à la longueur annoncée", () => {
  const source = (chunks: number[][]) => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(Uint8Array.from(ch));
        c.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const reader = stream.getReader();
    return { reader, wasCancelled: () => cancelled };
  };
  const read = async (body: ReadableStream<Uint8Array>) => new Uint8Array(await new Response(body).arrayBuffer());

  it("premier morceau plus long que la plage : tronqué, amont libéré", async () => {
    const { reader, wasCancelled } = source([[1, 2, 3, 4, 5, 6, 7, 8], [9, 9]]);
    const first = await reader.read();
    expect(Array.from(await read(boundedRangeBody(reader, first, 5)))).toEqual([1, 2, 3, 4, 5]);
    expect(wasCancelled()).toBe(true);
  });

  it("morceau suivant qui franchit la limite : tronqué au lieu de faire échouer la plage", async () => {
    const { reader } = source([[1, 2], [3, 4, 5, 6]]);
    const first = await reader.read();
    expect(Array.from(await read(boundedRangeBody(reader, first, 4)))).toEqual([1, 2, 3, 4]);
  });

  it("corps plus court qu'annoncé : la réponse échoue", async () => {
    const { reader } = source([[1, 2]]);
    const first = await reader.read();
    await expect(read(boundedRangeBody(reader, first, 4))).rejects.toThrow();
  });
});
