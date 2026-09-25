import "server-only";
import { adminAuth } from "@/lib/firebase/admin";

/**
 * État du compte Firebase d'un uid, mémorisé 5 minutes par uid et par instance : partagé par les sessions web
 * (lib/auth.ts) et les clés MCP (lib/api-keys.ts). `validAfter` = dernière révocation des jetons (ms), 0 si inconnue.
 * Coût : au plus un aller-retour vers Identity Toolkit (accounts:lookup) par uid, par instance et par tranche de 5 minutes.
 */
export interface AccountState {
  active: boolean;
  validAfter: number;
}

const ACCOUNT_CHECK_TTL_MS = 5 * 60 * 1000;
const accountCache = new Map<string, AccountState & { until: number }>();

/** Oublie l'état mémorisé (tests, ou après une révocation ou une suppression faite sur cette instance). */
export function forgetAccountState(uid?: string): void {
  if (uid) accountCache.delete(uid);
  else accountCache.clear();
}

/** Lève une erreur si Firebase Auth ne répond pas : à l'appelant de choisir entre échec ouvert et fermé. */
export async function accountState(uid: string): Promise<AccountState> {
  const cached = accountCache.get(uid);
  if (cached && cached.until > Date.now()) return { active: cached.active, validAfter: cached.validAfter };
  let state: AccountState;
  try {
    const user = await (await adminAuth()).getUser(uid);
    const validAfter = user.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) : 0;
    state = { active: !user.disabled, validAfter: Number.isFinite(validAfter) ? validAfter : 0 };
  } catch (e) {
    // Compte supprimé (depuis la console, ou par « Supprimer mon compte » sur une autre instance) : refusé.
    if ((e as { code?: unknown } | null)?.code !== "auth/user-not-found") throw e;
    state = { active: false, validAfter: 0 };
  }
  if (accountCache.size > 1000) accountCache.clear();
  accountCache.set(uid, { ...state, until: Date.now() + ACCOUNT_CHECK_TTL_MS });
  return state;
}
