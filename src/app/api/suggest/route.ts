import { NextResponse } from "next/server";
import { shortId, VERIFIED_TYPES, withCredentials } from "@/lib/openalex";
import { logError } from "@/lib/log";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export interface Suggestion {
  id: string;
  title: string;
  hint: string | null;
  citations: number;
}

interface AutocompleteResult {
  id: string;
  display_name: string;
  hint: string | null;
  cited_by_count: number;
  entity_type: string;
}

/** Autocomplétion d'articles via OpenAlex, re-triée par citations (l'ordre natif privilégie le préfixe exact). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 200) ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });
  // Une frappe = une requête : la limite laisse large à un humain et freine un script (limite par instance).
  if (!rateLimit(`suggest:${clientIp(req)}`, 120, 60_000)) return NextResponse.json({ results: [], error: "Trop de requêtes, réessayez dans une minute." }, { status: 429 });

  const url = new URL("https://api.openalex.org/autocomplete/works");
  url.searchParams.set("q", q);
  // Mêmes exclusions que la recherche (BASE_FILTERS) : pas de paratexte, pas de rétractés.
  url.searchParams.set("filter", `type:${VERIFIED_TYPES},primary_location.source.is_core:true,is_paratext:false,is_retracted:false`);
  withCredentials(url);

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) {
      logError("suggest.GET", new Error(`OpenAlex ${res.status}`), { status: res.status });
      return NextResponse.json({ results: [] });
    }
    const data = (await res.json()) as { results: AutocompleteResult[] };
    const results: Suggestion[] = data.results
      .filter((r) => r.entity_type === "work" && r.display_name)
      .sort((a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0))
      .slice(0, 6)
      .map((r) => ({ id: shortId(r.id), title: r.display_name, hint: r.hint, citations: r.cited_by_count ?? 0 }));
    return NextResponse.json({ results }, { headers: { "cache-control": "public, max-age=300, s-maxage=300" } });
  } catch (e) {
    logError("suggest.GET", e);
    return NextResponse.json({ results: [] });
  }
}
