import type { Location, Work } from "@/lib/openalex";
import type { FavoriteSnapshot } from "@/lib/favorites-shared";

/** Article OpenAlex minimal et cohérent ; chaque test ne surcharge que ce qu'il vérifie. */
export function makeWork(overrides: Partial<Work> = {}): Work {
  return {
    id: "https://openalex.org/W4200000001",
    doi: "https://doi.org/10.1000/xyz123",
    title: "Open access and citation advantage",
    display_name: "Open access and citation advantage",
    publication_year: 2018,
    publication_date: "2018-02-13",
    type: "article",
    language: "en",
    cited_by_count: 1200,
    authorships: [
      { author_position: "first", author: { id: null, display_name: "Heather Piwowar", orcid: null }, institutions: [] },
      { author_position: "last", author: { id: null, display_name: "Jason Priem", orcid: null }, institutions: [] },
    ],
    primary_location: location({ source: { id: "S1", display_name: "PeerJ", type: "journal" } }),
    best_oa_location: null,
    open_access: { is_oa: false, oa_status: "closed", oa_url: null },
    primary_topic: { id: "https://openalex.org/T10001", display_name: "Open science" },
    biblio: { volume: "6", issue: null, first_page: "e4375", last_page: null },
    ...overrides,
  };
}

export function location(overrides: Partial<Location> = {}): Location {
  return { is_oa: false, landing_page_url: null, pdf_url: null, source: null, license: null, version: null, ...overrides };
}

export function makeSnapshot(overrides: Partial<FavoriteSnapshot> = {}): FavoriteSnapshot {
  return {
    id: "W4200000001",
    title: "Open access and citation advantage",
    authors: "Heather Piwowar et Jason Priem",
    authorNames: ["Heather Piwowar", "Jason Priem"],
    venue: "PeerJ",
    year: 2018,
    doi: "https://doi.org/10.1000/xyz123",
    type: "article",
    isOa: true,
    citedByCount: 1200,
    topic: "Open science",
    ...overrides,
  };
}
