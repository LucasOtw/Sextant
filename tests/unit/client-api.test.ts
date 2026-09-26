import { describe, expect, it, vi } from "vitest";
import { api, ApiError, errorMessage, needsSignIn } from "@/lib/client/api";
import { initialsOf } from "@/lib/format";

function stubFetch(res: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (res instanceof Error) throw res;
    return res;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("client HTTP commun (QUAL-10)", () => {
  it("corps JSON : content-type et sérialisation posés ; réponse lue", async () => {
    const fetchMock = stubFetch(Response.json({ collection: { id: "l1" } }, { status: 201 }));
    expect(await api("/api/collections", { method: "POST", json: { name: "Thèse" } })).toEqual({ collection: { id: "l1" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/collections", { method: "POST", headers: { "content-type": "application/json" }, body: '{"name":"Thèse"}' });
  });

  it("sans corps : ni en-tête ni body", async () => {
    const fetchMock = stubFetch(Response.json({ ok: true }));
    await api("/api/collections/l1", { method: "DELETE" });
    expect(fetchMock).toHaveBeenCalledWith("/api/collections/l1", { method: "DELETE" });
  });

  it("refus : ApiError avec le statut et le message de la route", async () => {
    stubFetch(Response.json({ error: "Limite de 50 listes atteinte." }, { status: 409 }));
    const e = await api("/api/collections", { method: "POST", json: {} }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 409, message: "Limite de 50 listes atteinte." });
    expect(needsSignIn(e)).toBe(false);
  });

  it("réponse vide ou en HTML : le message de repli, jamais une erreur d'analyse", async () => {
    stubFetch(new Response("<html>504</html>", { status: 504 }));
    const e = await api("/api/x", { fallback: "La suppression a échoué." }).catch((x: unknown) => x);
    expect(e).toMatchObject({ status: 504, message: "La suppression a échoué." });
    stubFetch(new Response(null, { status: 200 }));
    expect(await api("/api/x")).toEqual({});
  });

  it("401 : needsSignIn ; coupure réseau : message de repli, pas le texte technique", async () => {
    stubFetch(Response.json({ error: "Non connecté." }, { status: 401 }));
    const e = await api("/api/x").catch((x: unknown) => x);
    expect(needsSignIn(e)).toBe(true);
    expect(errorMessage(e, "repli")).toBe("Non connecté.");
    stubFetch(new TypeError("Failed to fetch"));
    const net = await api("/api/x").catch((x: unknown) => x);
    expect(needsSignIn(net)).toBe(false);
    expect(errorMessage(net, "La note n'a pas pu être enregistrée.")).toBe("La note n'a pas pu être enregistrée.");
  });
});

describe("initialsOf", () => {
  it.each([
    [{ name: "Ada Lovelace", email: "ada@exemple.fr" }, "AL"],
    [{ name: null, email: "ada@exemple.fr" }, "AE"],
    [{ name: "Plato" }, "P"],
    [{}, "?"],
  ])("%j → %s", (user, expected) => {
    expect(initialsOf(user)).toBe(expected);
  });
});
