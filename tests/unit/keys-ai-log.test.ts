import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_KEY_FORMAT, API_KEY_ID } from "@/lib/api-keys-shared";
import { hashKey, verifyKey } from "@/lib/api-keys";
import { isExpectedAuthError, logError, recover } from "@/lib/log";

describe("clés d'API (serveur MCP)", () => {
  it("hashKey : SHA-256 en hexadécimal (vecteur de référence)", () => {
    expect(hashKey("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("l'empreinte d'une clé a le format d'un identifiant de document", () => {
    const key = `sxt_${randomBytes(32).toString("base64url")}`;
    expect(API_KEY_FORMAT.test(key)).toBe(true);
    expect(API_KEY_ID.test(hashKey(key))).toBe(true);
    expect(hashKey(key)).not.toContain(key.slice(4));
  });

  it("API_KEY_FORMAT refuse les clés tronquées, rallongées ou d'un autre préfixe", () => {
    const body = "A".repeat(43);
    expect(API_KEY_FORMAT.test(`sxt_${body}`)).toBe(true);
    expect(API_KEY_FORMAT.test(`sxt_${body.slice(1)}`)).toBe(false);
    expect(API_KEY_FORMAT.test(`sxt_${body}A`)).toBe(false);
    expect(API_KEY_FORMAT.test(`sk_${body}`)).toBe(false);
    expect(API_KEY_FORMAT.test(`sxt_${body.slice(1)}/`)).toBe(false);
  });

  it("API_KEY_ID refuse tout ce qui n'est pas 64 caractères hexadécimaux minuscules", () => {
    expect(API_KEY_ID.test("a".repeat(64))).toBe(true);
    expect(API_KEY_ID.test("A".repeat(64))).toBe(false);
    expect(API_KEY_ID.test("a".repeat(63))).toBe(false);
    expect(API_KEY_ID.test(`../${"a".repeat(61)}`)).toBe(false);
  });

  it("verifyKey rejette une clé mal formée sans interroger Firestore", async () => {
    // Firestore est remplacé par un module qui lève une erreur (tests/stubs) : un accès ferait échouer le test.
    await expect(verifyKey("n'importe quoi")).resolves.toBeNull();
    await expect(verifyKey(`sxt_${"A".repeat(42)}`)).resolves.toBeNull();
  });
});

describe("validation de AI_MODEL et choix du fournisseur", () => {
  // Chaque test recharge le module : l'avertissement « une seule fois » est un état de module.
  beforeEach(() => {
    vi.resetModules();
    for (const name of ["AI_PROVIDER", "AI_MODEL", "MISTRAL_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "ANTHROPIC_API_KEY"]) vi.stubEnv(name, "");
  });
  const load = () => import("@/lib/ai");

  it("modèles par défaut, économiques", async () => {
    const { modelFor } = await load();
    expect(modelFor("mistral")).toBe("ministral-8b-latest");
    expect(modelFor("anthropic")).toBe("claude-haiku-4-5");
  });

  it.each(["mistral-small-latest", "meta-llama/llama-3.3-70b-instruct:free", "gpt-oss-120b", "claude-sonnet-4-5"])("retient un nom de modèle : %s", async (model) => {
    vi.stubEnv("AI_MODEL", ` ${model} `);
    const { modelFor } = await load();
    expect(modelFor("groq")).toBe(model);
  });

  it.each([
    ["clé Anthropic", "sk-ant-api03-abcdef"],
    ["clé Mistral", "mstrl-abcdef"],
    ["clé Groq", "gsk_abcdef"],
    ["clé Sextant", "sxt_abcdef"],
    ["jeton sans séparateur", "abcdefghijklmnopqrstuvwxyz0123"],
    ["espaces", "mon modele"],
    ["trop long", `m${"-a".repeat(40)}`],
    ["caractères interdits", "modèle<script>"],
  ])("ignore une valeur qui n'est pas un nom de modèle (%s), sans la journaliser", async (_label, value) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("AI_MODEL", value);
    const { modelFor } = await load();
    expect(modelFor("mistral")).toBe("ministral-8b-latest");
    expect(modelFor("mistral")).toBe("ministral-8b-latest");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).not.toContain(value);
  });

  it("activeProvider : AI_PROVIDER sans tenir compte de la casse, sinon la première clé présente", async () => {
    const { activeProvider } = await load();
    expect(activeProvider()).toBeNull();
    vi.stubEnv("GROQ_API_KEY", "x");
    vi.stubEnv("ANTHROPIC_API_KEY", "x");
    expect(activeProvider()).toBe("groq");
    vi.stubEnv("AI_PROVIDER", " Anthropic ");
    expect(activeProvider()).toBe("anthropic");
  });

  it("activeProvider : une valeur inconnue est ignorée avec un avertissement qui ne la cite pas", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("AI_PROVIDER", "sk-secret-colle-par-erreur");
    vi.stubEnv("MISTRAL_API_KEY", "x");
    const { activeProvider } = await load();
    expect(activeProvider()).toBe("mistral");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).not.toContain("sk-secret");
  });
});

describe("journal d'erreurs", () => {
  it("une ligne JSON sans identifiant utilisateur ni e-mail, contexte incapable d'écraser les champs fixes", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("NOT_FOUND: projects/p/databases/(default)/documents/users/uid123/notes/W1 (jean.dupont@example.org)"), { code: 5 });
    logError("notes.GET", err, { workId: "W1", level: "debug", scope: "autre" });
    const entry = JSON.parse(String(spy.mock.calls[0][0]));
    expect(entry).toMatchObject({ level: "error", scope: "notes.GET", workId: "W1", name: "Error", code: 5 });
    expect(entry.message).toContain("users/<uid>/notes/W1");
    expect(entry.message).toContain("<email>");
    expect(entry.message).not.toContain("uid123");
    expect(entry.message).not.toContain("jean.dupont");
  });

  it("message tronqué à 300 caractères, cause réseau conservée", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("x", new Error("a".repeat(5000), { cause: { code: "ECONNRESET" } }));
    const entry = JSON.parse(String(spy.mock.calls[0][0]));
    expect(entry.message).toHaveLength(300);
    expect(entry.cause).toBe("ECONNRESET");
  });

  it("recover journalise puis renvoie le repli", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(recover("search.topic", null)(new Error("panne"))).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("isExpectedAuthError distingue une session refusée d'une panne", () => {
    expect(isExpectedAuthError({ code: "auth/session-cookie-expired" })).toBe(true);
    expect(isExpectedAuthError({ code: "auth/internal-error" })).toBe(false);
    expect(isExpectedAuthError(new Error("réseau"))).toBe(false);
    expect(isExpectedAuthError(null)).toBe(false);
    // `auth/argument-error` : refus seulement si le message vient du vérificateur de jetons de firebase-admin.
    expect(isExpectedAuthError({ code: "auth/argument-error", message: "Firebase session cookie has invalid signature." })).toBe(true);
    expect(isExpectedAuthError({ code: "auth/argument-error", message: "Decoding Firebase ID token failed. Make sure…" })).toBe(true);
    expect(isExpectedAuthError({ code: "auth/argument-error", message: "verifySessionCookie() expects a session cookie, but was given a custom token." })).toBe(true);
    expect(isExpectedAuthError({ code: "auth/argument-error", message: "network timeout" })).toBe(false);
    expect(isExpectedAuthError({ code: "auth/argument-error", message: "Error fetching public keys for Google certs: …" })).toBe(false);
    expect(isExpectedAuthError({ code: "auth/argument-error" })).toBe(false);
  });
});
