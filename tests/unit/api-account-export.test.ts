import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeSnapshot } from "../fixtures";

/**
 * Export RGPD (NEW-2) : toutes les données rattachées au compte figurent dans le fichier, y compris hors de
 * `users/{uid}` (sujets publiés, liens de partage, clés sans empreinte), avec la date de dernière connexion.
 */
const ts = (iso: string) => ({ toDate: () => new Date(iso) });
const profile = vi.hoisted(() => ({ fields: {} as Record<string, unknown> }));
const auth = vi.hoisted(() => ({ requireStrictUser: vi.fn() }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: async () => ({ doc: () => ({ get: async () => ({ get: (f: string) => profile.fields[f] }) }) }),
  adminAuth: async () => ({ getUser: async () => ({ metadata: { creationTime: "Wed, 01 Jan 2025 00:00:00 GMT" } }) }),
}));
vi.mock("@/lib/favorites", () => ({ listFavorites: async () => [{ ...makeSnapshot(), addedAt: "2026-01-01T00:00:00.000Z" }] }));
vi.mock("@/lib/collections", () => ({ listCollections: async () => [{ id: "c1", name: "Mémoire", description: "", articleIds: ["W4200000001"], createdAt: null, shareToken: "tok" }] }));
vi.mock("@/lib/highlights", () => ({ listHighlights: async () => [] }));
vi.mock("@/lib/notes", () => ({ listAllNotes: async () => [{ workId: "W4200000001", text: "Idée", article: makeSnapshot(), updatedAt: null }] }));
vi.mock("@/lib/api-keys", () => ({
  listKeysForExport: async () => [{ name: "Claude", prefix: "sxt_abcdef", createdAt: "2026-02-01T00:00:00.000Z", lastUsedAt: null, createdBySessionAt: null }],
}));
vi.mock("@/lib/feedback", () => ({
  listFeedbackByAuthor: async () => [{ id: "f1", kind: "idea", title: "Export RIS", description: "", votes: 3, status: "open", createdAt: "2026-03-01T00:00:00.000Z" }],
  listFeedbackVotesForExport: async () => [{ id: "f1", createdAt: "2026-03-01T00:00:00.000Z" }],
}));
vi.mock("@/lib/shares", () => ({ listSharesForExport: async () => [{ token: "tok", collectionId: "c1", createdAt: "2026-04-01T00:00:00.000Z" }] }));

const { GET } = await import("@/app/api/account/export/route");

describe("GET /api/account/export", () => {
  let n = 0;
  beforeEach(() => {
    profile.fields = {};
    const user = { uid: `u${++n}`, name: "Ada", email: "ada@exemple.org", picture: null, authTime: 0 };
    auth.requireStrictUser.mockResolvedValue({ ok: true, user, refused: null });
  });

  it("sans session : refus de la garde stricte", async () => {
    auth.requireStrictUser.mockResolvedValueOnce({ ok: false, user: null, refused: Response.json({ error: "Non connecté." }, { status: 401 }) });
    expect((await GET()).status).toBe(401);
  });

  it("contient profil complet, bibliothèque, liens, clés sans empreinte, sujets et votes", async () => {
    profile.fields = {
      createdAt: ts("2025-06-01T00:00:00Z"),
      lastLoginAt: ts("2026-09-20T08:00:00Z"),
      lastKeyUsedAt: ts("2026-09-22T09:00:00Z"),
      lastRemovedFavorite: { snapshot: makeSnapshot({ id: "W9" }), at: ts("2026-09-21T00:00:00Z") },
      favoriteIds: ["W4200000001"],
    };
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="sextant-mes-donnees-\d{4}-\d{2}-\d{2}\.json"$/);
    const data = await res.json();
    expect(data.profile).toMatchObject({ uid: `u${n}`, email: "ada@exemple.org", createdAt: "2025-06-01T00:00:00.000Z", lastLoginAt: "2026-09-20T08:00:00.000Z", lastKeyUsedAt: "2026-09-22T09:00:00.000Z" });
    expect(data.favorites).toHaveLength(1);
    expect(data.lastRemovedFavorite).toMatchObject({ article: { id: "W9" }, removedAt: "2026-09-21T00:00:00.000Z" });
    expect(data.lists[0]).toMatchObject({ name: "Mémoire", shareToken: "tok" });
    expect(data.sharedLinks).toEqual([{ token: "tok", collectionId: "c1", createdAt: "2026-04-01T00:00:00.000Z" }]);
    expect(data.notes).toHaveLength(1);
    expect(data.assistantKeys).toEqual([{ name: "Claude", prefix: "sxt_abcdef", createdAt: "2026-02-01T00:00:00.000Z", lastUsedAt: null, createdBySessionAt: null }]);
    expect(data.feedback.published[0]).toMatchObject({ id: "f1", title: "Export RIS" });
    expect(data.feedback.votes).toEqual([{ id: "f1", createdAt: "2026-03-01T00:00:00.000Z" }]);
    // Les champs d'index internes (favoriteIds) ne sont pas une donnée de plus : ils ne sont pas repris.
    expect(JSON.stringify(data)).not.toContain("favoriteIds");
  });

  it("profil Firestore absent : date d'inscription reprise de Firebase Auth, dernière connexion inconnue", async () => {
    const data = await (await GET()).json();
    expect(data.profile.createdAt).toBe("2025-01-01T00:00:00.000Z");
    expect(data.profile.lastLoginAt).toBeNull();
    expect(data.lastRemovedFavorite).toBeNull();
  });
});
