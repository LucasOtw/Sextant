import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { purgeInactive } from "@/lib/account";
import { refreshFeedbackList } from "@/lib/feedback";
import { isAdminConfigured } from "@/lib/firebase/admin";
import { logError } from "@/lib/log";
import { RETENTION } from "@/lib/retention";

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
 * Purge des comptes inactifs et des clés d'assistant IA inutilisées (NEW-14), selon les durées de lib/retention.ts.
 * Appelée par une tâche planifiée Vercel (Cron Jobs), qui envoie `Authorization: Bearer <CRON_SECRET>`. Sans secret
 * configuré, la route refuse tout ; sans durée décidée, elle ne fait rien. `?dryRun=1` compte sans rien supprimer :
 * à lancer à la main avant la première vraie purge, qui est irréversible.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Tâche non configurée." }, { status: 503 });
  if (!sameSecret(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const headers = { "cache-control": "private, no-store" };
  if (RETENTION.inactiveAccountMonths === null && RETENTION.unusedKeyMonths === null) {
    return NextResponse.json({ enabled: false }, { headers });
  }
  if (!isAdminConfigured()) return NextResponse.json({ error: "Base non configurée." }, { status: 503 });
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  try {
    const report = await purgeInactive({
      now: Date.now(),
      accountMonths: RETENTION.inactiveAccountMonths,
      keyMonths: RETENTION.unusedKeyMonths,
      dryRun,
    });
    // Des votes ont été retirés avec les comptes : la liste publique de /retours est relue.
    if (!dryRun && report.accounts + report.failed > 0) refreshFeedbackList("retention.invalidate");
    return NextResponse.json({ enabled: true, ...report }, { headers });
  } catch (e) {
    logError("retention.GET", e);
    return NextResponse.json({ error: "La purge a échoué." }, { status: 500 });
  }
}
