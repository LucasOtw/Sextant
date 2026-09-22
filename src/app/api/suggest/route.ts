import { NextResponse } from "next/server";
import { shortId } from "@/lib/openalex";

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
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const url = new URL("https://api.openalex.org/autocomplete/works");
  url.searchParams.set("q", q);
  const mailto = process.env.OPENALEX_MAILTO;
  if (mailto) url.searchParams.set("mailto", mailto);

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return NextResponse.json({ results: [] });
    const data = (await res.json()) as { results: AutocompleteResult[] };
    const results: Suggestion[] = data.results
      .filter((r) => r.entity_type === "work" && r.display_name)
      .sort((a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0))
      .slice(0, 6)
      .map((r) => ({ id: shortId(r.id), title: r.display_name, hint: r.hint, citations: r.cited_by_count ?? 0 }));
    return NextResponse.json({ results }, { headers: { "cache-control": "public, max-age=300" } });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
