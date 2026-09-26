import { describe, expect, it } from "vitest";
import { dateFromTimestamp, isoFromTimestamp, millisFromTimestamp } from "@/lib/firebase/decode";

/** Horodatage de la forme d'un Timestamp Firestore (toDate / toMillis), sans charger firebase-admin. */
const stamp = (iso: string) => {
  const d = new Date(iso);
  return { toDate: () => d, toMillis: () => d.getTime() };
};

describe("lecture des horodatages Firestore (QUAL-11)", () => {
  it("un Timestamp donne sa date, son ISO et ses millisecondes", () => {
    const t = stamp("2026-09-24T10:00:00.000Z");
    expect(dateFromTimestamp(t)?.toISOString()).toBe("2026-09-24T10:00:00.000Z");
    expect(isoFromTimestamp(t)).toBe("2026-09-24T10:00:00.000Z");
    expect(millisFromTimestamp(t)).toBe(Date.parse("2026-09-24T10:00:00.000Z"));
  });

  it.each([undefined, null, "2026-09-24", 1_700_000_000_000, {}, { toDate: "pas une fonction" }])("%j → null", (v) => {
    expect(dateFromTimestamp(v)).toBeNull();
    expect(isoFromTimestamp(v)).toBeNull();
    expect(millisFromTimestamp(v)).toBeNull();
  });
});
