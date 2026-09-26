import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { purgeInactive } from "@/lib/account";
import { refreshFeedbackList } from "@/lib/feedback";
import { isAdminConfigured } from "@/lib/firebase/admin";
import { logError } from "@/lib/log";
import { RETENTION, validMonths } from "@/lib/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 50 comptes au plus par passage (lib/account.ts) : quelques secondes chacun dans le pire cas. */
export const maxDuration = 300;

/** Compare deux chaînes en temps constant (empreintes de même longueur) : le secret ne se devine pas au chronomètre. */
function sameSecret(given: string, expected: string): boolean {
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(given), h(expected));
}

/**
 * Durée passée en paramètre d'un essai à blanc : absente → undefined (la durée de lib/retention.ts s'applique),
 * illisible → null (requête refusée), sinon le nombre de mois.
 */
function monthsParam(sp: URLSearchParams, name: string): number | null | undefined {
  const raw = sp.get(name);
  if (raw === null) return undefined;
  return /^\d+$/.test(raw) ? validMonths(Number(raw)) : null;
}

/**
 * Purge des comptes inactifs et des clés d'assistant IA inutilisées (NEW-14), selon les durées de lib/retention.ts.
 * Appelée par une tâche planifiée Vercel (Cron Jobs), qui envoie `Authorization: Bearer <CRON_SECRET>`. Sans secret
 * configuré, la route refuse tout ; sans durée décidée, elle ne fait rien. `?dryRun=1` compte sans rien supprimer :
 * à lancer à la main avant la première vraie purge, qui est irréversible. En mode à blanc seulement, des durées
 * candidates peuvent être passées (`&accountMonths=36&keyMonths=12`) : l'essai se fait avant de les publier dans
 * lib/retention.ts, donc avant que la politique de confidentialité ne promette la purge. Hors mode à blanc, ces
 * paramètres sont ignorés : seules les durées publiées suppriment.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Tâche non configurée." }, { status: 503 });
  if (!sameSecret(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const headers = { "cache-control": "private, no-store" };
  const sp = new URL(req.url).searchParams;
  const dryRun = sp.get("dryRun") === "1";
  // Purge activée = au moins une durée publiée dans lib/retention.ts (celle que lit la politique de confidentialité).
  const enabled = validMonths(RETENTION.inactiveAccountMonths) !== null || validMonths(RETENTION.unusedKeyMonths) !== null;
  let accountMonths = validMonths(RETENTION.inactiveAccountMonths);
  let keyMonths = validMonths(RETENTION.unusedKeyMonths);
  if (dryRun) {
    const account = monthsParam(sp, "accountMonths");
    const key = monthsParam(sp, "keyMonths");
    if (account === null || key === null) {
      return NextResponse.json({ error: "Durée invalide : un nombre entier de mois, au moins 1." }, { status: 400, headers });
    }
    if (account !== undefined) accountMonths = account;
    if (key !== undefined) keyMonths = key;
  }
  if (accountMonths === null && keyMonths === null) return NextResponse.json({ enabled }, { headers });
  if (!isAdminConfigured()) return NextResponse.json({ error: "Base non configurée." }, { status: 503 });
  try {
    const report = await purgeInactive({ now: Date.now(), accountMonths, keyMonths, dryRun });
    // Des votes ont été retirés avec les comptes : la liste publique de /retours est relue.
    if (!dryRun && report.accounts + report.failed > 0) refreshFeedbackList("retention.invalidate");
    return NextResponse.json({ enabled, accountMonths, keyMonths, ...report }, { headers });
  } catch (e) {
    logError("retention.GET", e);
    return NextResponse.json({ error: "La purge a échoué." }, { status: 500 });
  }
}
