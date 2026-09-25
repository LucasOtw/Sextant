import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";
import { makeSnapshot } from "../fixtures";
import type { FavoriteSnapshot } from "@/lib/favorites-shared";

/** Un uid neuf par test : les tests restent indépendants sans jamais vider la base de l'émulateur. */
export function newUid(): string {
  return `test-${randomUUID()}`;
}

/** Instantané d'article d'identifiant `W<n>`. */
export function snap(n: number, overrides: Partial<FavoriteSnapshot> = {}): FavoriteSnapshot {
  return makeSnapshot({ id: `W${n}`, title: `Article ${n}`, ...overrides });
}

export async function userDoc(uid: string): Promise<Record<string, unknown> | undefined> {
  return (await (await adminDb()).doc(`users/${uid}`).get()).data();
}

export async function exists(path: string): Promise<boolean> {
  return (await (await adminDb()).doc(path).get()).exists;
}
