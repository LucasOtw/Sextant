import { describe, expect, it } from "vitest";
import { hasSessionHint, readCookie, SESSION_HINT_COOKIE, sessionHintFix, sessionHintOptions, setSessionHint, toClientUser } from "@/lib/session-shared";

describe("indice de connexion lisible par le navigateur (PERF-01)", () => {
  it("lu dans document.cookie, à la valeur exacte", () => {
    expect(hasSessionHint("sextant_signed_in=1")).toBe(true);
    expect(hasSessionHint("theme=dark; sextant_signed_in=1; autre=2")).toBe(true);
    expect(hasSessionHint("theme=dark;sextant_signed_in=1")).toBe(true);
    expect(hasSessionHint("")).toBe(false);
    expect(hasSessionHint("sextant_signed_in=")).toBe(false);
    expect(hasSessionHint("xsextant_signed_in=1")).toBe(false);
    expect(hasSessionHint("sextant_signed_in=10")).toBe(false);
    expect(hasSessionHint("sextant_signed_in=0")).toBe(false);
  });

  it("accordé par le proxy à la seule présence du cookie de session, marque « refusée » des versions précédentes respectée", () => {
    expect(sessionHintFix(true, undefined)).toBe("on");
    expect(sessionHintFix(true, "1")).toBeNull();
    expect(sessionHintFix(true, "0")).toBeNull();
    expect(sessionHintFix(false, "1")).toBe("off");
    expect(sessionHintFix(false, "0")).toBe("off");
    expect(sessionHintFix(false, undefined)).toBeNull();
  });

  it("posé lisible (pas HttpOnly), Lax, sur tout le site ; effacé avec Max-Age 0", () => {
    const calls: unknown[][] = [];
    const res = { cookies: { set: (...args: unknown[]) => calls.push(args) } };
    setSessionHint(res, "on");
    setSessionHint(res, "off");
    expect(calls[0]).toEqual([SESSION_HINT_COOKIE, "1", { ...sessionHintOptions("on"), httpOnly: false, sameSite: "lax", path: "/" }]);
    expect((calls[0][2] as { maxAge: number }).maxAge).toBe(14 * 24 * 3600);
    expect(calls[1]).toEqual([SESSION_HINT_COOKIE, "", sessionHintOptions("off")]);
    expect((calls[1][2] as { maxAge: number }).maxAge).toBe(0);
  });

  it("readCookie : valeur exacte d'un cookie nommé", () => {
    expect(readCookie("a=1; sextant_session=abc=def; b=2", "sextant_session")).toBe("abc=def");
    expect(readCookie("xsextant_session=1", "sextant_session")).toBeUndefined();
    expect(readCookie("", "sextant_session")).toBeUndefined();
    expect(readCookie("sextant_signed_in=", "sextant_signed_in")).toBe("");
  });

  it("l'identité transmise à l'interface ne garde que quatre champs", () => {
    const user = { uid: "u1", name: "Ada", email: "ada@exemple.fr", picture: null, authTime: 123, extra: "x" };
    expect(toClientUser(user)).toEqual({ uid: "u1", name: "Ada", email: "ada@exemple.fr", picture: null });
  });
});
