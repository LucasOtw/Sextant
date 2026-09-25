import "server-only";
import type { DocumentData, Query, QueryDocumentSnapshot } from "firebase-admin/firestore";

/** Taille d'une page lue par un filtre texte : on s'arrête dès qu'il y a assez de résultats. */
const SCAN_PAGE = 200;

/**
 * Parcourt une requête triée par pages de 200 et garde les documents qui correspondent à `match`,
 * jusqu'à en avoir `limit` ou à avoir lu `max` documents : un filtre ne lit que ce qu'il lui faut.
 */
export async function scanPages<T>(
  query: Query<DocumentData>,
  toItem: (d: QueryDocumentSnapshot<DocumentData>) => T,
  match: (item: T) => boolean,
  limit: number,
  max: number,
): Promise<T[]> {
  const found: T[] = [];
  let read = 0;
  let last: QueryDocumentSnapshot<DocumentData> | undefined;
  while (read < max && found.length < limit) {
    const page = await (last ? query.startAfter(last) : query).limit(Math.min(SCAN_PAGE, max - read)).get();
    for (const d of page.docs) {
      const item = toItem(d);
      if (match(item)) found.push(item);
      if (found.length >= limit) break;
    }
    if (page.size < SCAN_PAGE) break;
    read += page.size;
    last = page.docs[page.docs.length - 1];
  }
  return found;
}
