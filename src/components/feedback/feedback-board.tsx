"use client";

import { useMemo, useState } from "react";
import { BugIcon, ChevronUpIcon, LightbulbIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { KIND_LABEL, MAX_FEEDBACK_DESCRIPTION, MAX_FEEDBACK_TITLE, STATUS_LABEL, type FeedbackItem, type FeedbackKind } from "@/lib/feedback-shared";
import { cn } from "cn";

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
const SORTS = [
  { value: "votes", label: "Les plus votés" },
  { value: "recent", label: "Les plus récents" },
];
type Filter = "all" | FeedbackKind;

interface Props {
  initial: FeedbackItem[];
  initialVoted: string[];
  signedIn: boolean;
  loadError?: boolean;
}

/** Liste publique des bugs et idées, avec vote (un par personne, retirable) et publication d'un nouveau sujet. */
export function FeedbackBoard({ initial, initialVoted, signedIn, loadError = false }: Props) {
  const [items, setItems] = useState(initial);
  const [voted, setVoted] = useState(() => new Set(initialVoted));
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState("votes");
  const [composing, setComposing] = useState(false);
  const [signIn, setSignIn] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());

  const shown = useMemo(() => {
    const list = items.filter((i) => filter === "all" || i.kind === filter);
    return [...list].sort((a, b) =>
      sort === "recent" ? (b.createdAt ?? "").localeCompare(a.createdAt ?? "") : b.votes - a.votes || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    );
  }, [items, filter, sort]);

  const counts = useMemo(() => ({ all: items.length, bug: items.filter((i) => i.kind === "bug").length, idea: items.filter((i) => i.kind === "idea").length }), [items]);

  async function vote(item: FeedbackItem) {
    if (!signedIn) return setSignIn("Connectez-vous pour voter. Un vote par personne, retirable à tout moment.");
    if (pending.has(item.id)) return;
    const was = voted.has(item.id);
    const apply = (on: boolean, votes: number) => {
      setVoted((s) => {
        const n = new Set(s);
        if (on) n.add(item.id);
        else n.delete(item.id);
        return n;
      });
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, votes } : i)));
    };
    apply(!was, Math.max(0, item.votes + (was ? -1 : 1)));
    setPending((p) => new Set(p).add(item.id));
    try {
      const res = await fetch(`/api/feedback/${item.id}/vote`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { votes?: number; voted?: boolean; error?: string };
      if (!res.ok || typeof data.votes !== "number") throw new Error(data.error ?? "Le vote n'a pas pu être enregistré.");
      apply(Boolean(data.voted), data.votes);
    } catch (e) {
      apply(was, item.votes);
      toast.error(e instanceof Error ? e.message : "Le vote n'a pas pu être enregistré.");
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(item.id);
        return n;
      });
    }
  }

  function openComposer() {
    if (!signedIn) return setSignIn("Connectez-vous pour signaler un bug ou proposer une idée.");
    setComposing(true);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer">
          {([
            ["all", "Tous"],
            ["bug", "Bugs"],
            ["idea", "Idées"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm transition-colors",
                filter === value ? "bg-primary text-primary-foreground" : "bg-card ring-1 ring-foreground/10 hover:ring-foreground/25",
              )}
            >
              {label} <span className={filter === value ? "text-primary-foreground/75" : "text-muted-foreground"}>{counts[value]}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Select items={SORTS} value={sort} onValueChange={(v) => setSort(String(v))}>
            <SelectTrigger className="h-10! w-44" aria-label="Trier"><SelectValue /></SelectTrigger>
            <SelectContent>{SORTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button className="h-10" onClick={openComposer}><PlusIcon /> Nouveau sujet</Button>
        </div>
      </div>

      {loadError && items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">La liste est momentanément indisponible. Réessayez dans un instant.</div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-lg font-medium">{items.length === 0 ? "Rien pour l'instant." : "Aucun sujet dans cette catégorie."}</p>
          <p className="mt-1 text-base text-muted-foreground">Un bug repéré, une idée qui vous manque ? Soyez le premier à la proposer.</p>
          <Button variant="outline" className="mt-5 bg-card" onClick={openComposer}><PlusIcon /> Nouveau sujet</Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((item) => (
            <FeedbackRow key={item.id} item={item} voted={voted.has(item.id)} busy={pending.has(item.id)} onVote={() => void vote(item)} />
          ))}
        </ul>
      )}

      <p className="text-sm text-muted-foreground">
        Les sujets sont publics et sans nom d'auteur ; n'y mettez pas d'informations personnelles. Les votes sont anonymes.
      </p>

      <Composer
        open={composing}
        onOpenChange={setComposing}
        onCreated={(item) => {
          setItems((list) => [item, ...list]);
          setVoted((s) => new Set(s).add(item.id));
          setSort("recent");
          setFilter("all");
        }}
      />
      {signIn && <SignInDialog open onOpenChange={(o) => !o && setSignIn(null)} intro={signIn} />}
    </div>
  );
}

function FeedbackRow({ item, voted, busy, onVote }: { item: FeedbackItem; voted: boolean; busy: boolean; onVote: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const long = item.description.length > 280;
  const status = STATUS_LABEL[item.status];
  return (
    <li className="flex gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
      <button
        type="button"
        onClick={onVote}
        aria-pressed={voted}
        aria-label={`${voted ? "Retirer mon vote" : "Voter"} : ${item.title} (${item.votes} vote${item.votes > 1 ? "s" : ""})`}
        disabled={busy}
        className={cn(
          "flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-lg text-sm font-semibold ring-1 transition-colors",
          voted ? "bg-accent-brand text-white ring-accent-brand" : "bg-background text-foreground ring-foreground/15 hover:ring-accent-brand hover:text-accent-brand",
        )}
      >
        <ChevronUpIcon className="size-4" aria-hidden />
        {item.votes}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className={cn("gap-1", item.kind === "bug" ? "text-destructive" : "text-accent-brand")}>
            {item.kind === "bug" ? <BugIcon aria-hidden /> : <LightbulbIcon aria-hidden />} {KIND_LABEL[item.kind]}
          </Badge>
          {status && <Badge className={cn(item.status === "done" && "bg-oa text-oa-foreground", item.status === "planned" && "bg-accent-brand/15 text-accent-brand", item.status === "declined" && "bg-muted text-muted-foreground")}>{status}</Badge>}
          {item.createdAt && <span className="text-xs text-muted-foreground">{DATE.format(new Date(item.createdAt))}</span>}
        </div>
        <h2 className="mt-1.5 text-[17px] font-semibold leading-snug">{item.title}</h2>
        {item.description && (
          <>
            <p className={cn("mt-1 whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground", long && !expanded && "line-clamp-3")}>{item.description}</p>
            {long && (
              <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-1 text-sm text-accent-brand underline underline-offset-3" aria-expanded={expanded}>
                {expanded ? "Réduire" : "Lire la suite"}
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function Composer({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (item: FeedbackItem) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle className="title-display text-2xl">Nouveau sujet</DialogTitle>
        <DialogDescription className="text-[15px] text-muted-foreground">
          Un sujet par bug ou par idée. Vérifiez d'abord qu'il n'existe pas déjà : un vote suffit alors.
        </DialogDescription>
        {open && <ComposerForm onClose={() => onOpenChange(false)} onCreated={onCreated} />}
      </DialogContent>
    </Dialog>
  );
}

function ComposerForm({ onClose, onCreated }: { onClose: () => void; onCreated: (item: FeedbackItem) => void }) {
  const [kind, setKind] = useState<FeedbackKind>("idea");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = title.trim().length >= 5;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, title, description }) });
      const data = (await res.json().catch(() => ({}))) as { item?: FeedbackItem; error?: string };
      if (!res.ok || !data.item) throw new Error(data.error ?? "La publication a échoué.");
      onCreated(data.item);
      toast.success(kind === "bug" ? "Bug signalé, merci !" : "Idée publiée, merci !");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "La publication a échoué.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-1 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Type de sujet">
        {([
          ["bug", "Un bug", "Quelque chose ne marche pas", BugIcon],
          ["idea", "Une idée", "Une amélioration, une fonctionnalité", LightbulbIcon],
        ] as const).map(([value, label, hint, Icon]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={kind === value}
            onClick={() => setKind(value)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-xl p-3 text-left ring-1 transition-colors",
              kind === value ? "bg-accent-brand/8 ring-2 ring-accent-brand" : "ring-foreground/15 hover:ring-foreground/30",
            )}
          >
            <span className="flex items-center gap-1.5 font-medium"><Icon className="size-4" aria-hidden /> {label}</span>
            <span className="text-xs text-muted-foreground">{hint}</span>
          </button>
        ))}
      </div>
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={MAX_FEEDBACK_TITLE}
        placeholder={kind === "bug" ? "Ex. Le PDF ne s'affiche pas sur iPhone" : "Ex. Exporter une liste au format RIS"}
        aria-label="Titre"
        className="h-10 text-base md:text-base"
      />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={MAX_FEEDBACK_DESCRIPTION}
        rows={4}
        placeholder={kind === "bug" ? "Ce que vous faisiez, ce qui s'est passé, sur quel appareil (facultatif)" : "À quoi ça vous servirait (facultatif)"}
        aria-label="Description"
        className="text-base md:text-[15px]"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
        <Button type="submit" disabled={!valid || busy}>{busy && <Loader2Icon className="animate-spin" />} Publier</Button>
      </div>
    </form>
  );
}
