import { describe, expect, it } from "vitest";
import { feedbackCounts, feedbackOrder, mergeFeedbackLists, type FeedbackItem } from "@/lib/feedback-shared";

const item = (id: string, over: Partial<FeedbackItem> = {}): FeedbackItem => ({
  id,
  kind: "idea",
  title: `Sujet ${id}`,
  description: "",
  votes: 0,
  status: "open",
  createdAt: "2026-09-01T00:00:00.000Z",
  ...over,
});

describe("mergeFeedbackLists (NEW-11)", () => {
  it("réunit plus votés et plus récents sans doublon, dans l'ordre d'arrivée", () => {
    const top = [item("a", { votes: 90 }), item("b", { votes: 40 })];
    const recent = [item("c"), item("b", { votes: 40 }), item("d")];
    expect(mergeFeedbackLists(top, recent).map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("le tri « Les plus votés » voit l'ancien sujet très soutenu venu de la requête par votes", () => {
    const old = item("ancien", { votes: 120, createdAt: "2024-01-01T00:00:00.000Z", status: "planned" });
    const recent = Array.from({ length: 5 }, (_, k) => item(`r${k}`, { votes: k, createdAt: `2026-09-0${k + 1}T00:00:00.000Z` }));
    expect(feedbackOrder(mergeFeedbackLists([old], recent), "votes")[0]).toBe("ancien");
  });
});

describe("feedbackCounts", () => {
  const items = [item("a", { kind: "bug" }), item("b"), item("c")];

  it("sans totaux (liste complète) : compté sur la liste", () => {
    expect(feedbackCounts(items, null, new Set())).toEqual({ all: 3, bug: 1, idea: 2 });
  });

  it("avec totaux (liste tronquée) : totaux de la base, pas la longueur de la liste", () => {
    expect(feedbackCounts(items, { all: 480, bug: 130, idea: 350 }, new Set(["a", "b", "c"]))).toEqual({ all: 480, bug: 130, idea: 350 });
  });

  it("avec totaux : un sujet publié depuis le chargement de la page s'y ajoute", () => {
    const now = [item("n", { kind: "bug" }), ...items];
    expect(feedbackCounts(now, { all: 480, bug: 130, idea: 350 }, new Set(["a", "b", "c"]))).toEqual({ all: 481, bug: 131, idea: 350 });
  });
});
