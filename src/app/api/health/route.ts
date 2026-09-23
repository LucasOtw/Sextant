import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";

export const runtime = "nodejs";

/** État de santé du serveur : présence des variables (booléens) et initialisation du SDK Admin. Aucun secret exposé. */
export async function GET() {
  const env = {
    openalexKey: Boolean(process.env.OPENALEX_API_KEY),
    mistralKey: Boolean(process.env.MISTRAL_API_KEY),
    firebasePublic: Boolean(
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    ),
    firebaseServiceAccount: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT),
    serviceAccountLength: process.env.FIREBASE_SERVICE_ACCOUNT?.length ?? 0,
    serviceAccountStartsWithBrace: process.env.FIREBASE_SERVICE_ACCOUNT?.trimStart().startsWith("{") ?? false,
  };
  let admin: { ok: boolean; error?: string } = { ok: false };
  try {
    await adminAuth();
    admin = { ok: true };
  } catch (e) {
    admin = { ok: false, error: e instanceof Error ? `${e.name}: ${e.message.slice(0, 200)}` : String(e).slice(0, 200) };
  }
  return NextResponse.json({ env, admin, node: process.version, region: process.env.VERCEL_REGION ?? null });
}
