import "server-only";

/**
 * Lecture tolérante des horodatages Firestore (QUAL-11) : un seul test de forme au lieu d'un cast par module.
 * Pas d'`instanceof Timestamp` : il chargerait firebase-admin/firestore de façon synchrone, alors que le code ne le charge
 * qu'à la demande (import dynamique). Une valeur absente ou d'une autre forme donne `null`.
 */

export function dateFromTimestamp(v: unknown): Date | null {
  const t = v as { toDate?: unknown } | null | undefined;
  return typeof t?.toDate === "function" ? (t.toDate as () => Date).call(t) : null;
}

export function isoFromTimestamp(v: unknown): string | null {
  return dateFromTimestamp(v)?.toISOString() ?? null;
}

export function millisFromTimestamp(v: unknown): number | null {
  const t = v as { toMillis?: unknown } | null | undefined;
  return typeof t?.toMillis === "function" ? (t.toMillis as () => number).call(t) : null;
}
