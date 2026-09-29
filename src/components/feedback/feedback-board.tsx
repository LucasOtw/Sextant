"use client";

import { useId, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { BugIcon, ChevronUpIcon, LightbulbIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleChip } from "@/components/ui/toggle-chip";
import { feedbackCounts, feedbackOrder, feedbackTitleHint, feedbackTitleLength, inOrder, KIND_LABEL, MAX_FEEDBACK_DESCRIPTION, MAX_FEEDBACK_TITLE, MIN_FEEDBACK_TITLE, STATUS_LABEL, type FeedbackItem, type FeedbackKind, type FeedbackTotals } from "@/lib/feedback-shared";
import { announce } from "@/lib/announce";
import { api, errorMessage } from "@/lib/client/api";
import { voteLabel } from "@/lib/labels";
import { REPORT_SECTION, reportHref } from "@/lib/report";
import { cn } from "@/lib/cn";
import { DATE_SHORT } from "@/lib/dates";
import { frSpaces } from "@/lib/text";

const SORTS = [
  { value: "votes", label: "Les plus votés" },
  { value: "recent", label: "Les plus récents" },
];
type Filter = "all" | FeedbackKind;

interface Props {
  initial: FeedbackItem[];
  /** Totaux de la base (lib/feedback.ts) : `initial` peut n'en être qu'une partie (plus votés et plus récents). */
  totals?: FeedbackTotals | null;
  initialVoted: string[];
  signedIn: boolean;
  loadError?: boolean;
  /** Signalement d'un sujet (DSA art. 16) : adresse de contact des mentions légales (null : leur section) et adresse de la page. */
  report?: { email: string | null; pageUrl: string };
}

/** Liste publique des bugs et idées, avec vote (un par personne, retirable) et publication d'un nouveau sujet. */
export function FeedbackBoard({ initial, totals = null, initialVoted, signedIn, loadError = false, report = { email: null, pageUrl: "/retours" } }: Props) {
  const [items, setItems] = useState(initial);
  const [voted, setVoted] = useState(() => new Set(initialVoted));
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState("votes");
  const [composing, setComposing] = useState(false);
  const [signIn, setSignIn] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());

  // Ordre figé, recalculé seulement quand le visiteur change le tri ou le filtre : voter en tri « Les plus votés » ne
  // déplace pas la ligne sous le focus (A11Y-19). Le nouveau classement apparaît au prochain tri ou au rechargement.
  const [order, setOrder] = useState(() => ({ sort, filter, ids: feedbackOrder(initial, sort) }));
  if (order.sort !== sort || order.filter !== filter) setOrder({ sort, filter, ids: feedbackOrder(items, sort) });

  const shown = useMemo(() => inOrder(items, order.ids).filter((i) => filter === "all" || i.kind === filter), [items, order.ids, filter]);

  // Totaux de la base (justes même si la liste est tronquée), plus les sujets publiés depuis l'arrivée sur la page.
  const [initialIds] = useState(() => new Set(initial.map((i) => i.id)));
  const counts = useMemo(() => feedbackCounts(items, totals, initialIds), [items, totals, initialIds]);
  const truncated = totals !== null && totals.all > initial.length;

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
      const data = await api<{ votes?: number; voted?: boolean }>(`/api/feedback/${item.id}/vote`, { method: "POST", fallback: "Le vote n'a pas pu être enregistré." });
      if (typeof data.votes !== "number") throw new Error();
      apply(Boolean(data.voted), data.votes);
    } catch (e) {
      apply(was, item.votes);
      toast.error(errorMessage(e, "Le vote n'a pas pu être enregistré."));
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
            <ToggleChip key={value} active={filter === value} onClick={() => setFilter(value)}>
              {label} <span className={filter === value ? undefined : "text-muted-foreground"}>{counts[value]}</span>
            </ToggleChip>
          ))}
        </div>
        <div className="flex gap-2">
          <Select items={SORTS} value={sort} onValueChange={(v) => setSort(String(v))}>
            <SelectTrigger className="w-44" aria-label="Trier"><SelectValue /></SelectTrigger>
            <SelectContent>{SORTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={openComposer}><PlusIcon /> Nouveau sujet</Button>
        </div>
      </div>

      {truncated && (
        <p className="text-sm text-muted-foreground">
          Sont affichés les sujets les plus votés et les plus récents : {initial.length} sur {totals.all}.
        </p>
      )}

      {loadError && items.length === 0 ? (
        <div className="surface-tint rounded-2xl p-10 text-center text-muted-foreground">La liste est momentanément indisponible. Réessayez dans un instant.</div>
      ) : shown.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? "Rien pour l'instant." : "Aucun sujet dans cette catégorie."}
          hint="Un bug repéré, une idée qui vous manque ? Soyez le premier à la proposer."
          action={<Button variant="outline" className="mt-5" onClick={openComposer}><PlusIcon /> Nouveau sujet</Button>}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((item) => (
            <FeedbackRow
              key={item.id}
              item={item}
              voted={voted.has(item.id)}
              busy={pending.has(item.id)}
              onVote={() => void vote(item)}
              reportLink={reportHref(report.email, `sujet « ${item.title} »`, `${report.pageUrl}#sujet-${item.id}`)}
            />
          ))}
        </ul>
      )}

      <p className="max-w-measure-text text-sm text-muted-foreground">
        Les sujets sont publics et sans nom d'auteur ; n'y mettez pas d'informations personnelles. Les votes sont anonymes. Un sujet
        illicite ou hors sujet se signale par son lien «&nbsp;Signaler&nbsp;» (<Link href={REPORT_SECTION} className="link-quiet">procédure</Link>).
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

function FeedbackRow({ item, voted, busy, onVote, reportLink }: { item: FeedbackItem; voted: boolean; busy: boolean; onVote: () => void; reportLink: string }) {
  const [expanded, setExpanded] = useState(false);
  const descriptionId = useId();
  const long = item.description.length > 280;
  const status = STATUS_LABEL[item.status];
  return (
    // Ancre du sujet : l'adresse exacte d'un signalement (DSA art. 16) mène à lui.
    <li id={`sujet-${item.id}`} className="surface-card flex scroll-mt-24 gap-4 p-4 sm:p-5">
      <button
        type="button"
        onClick={onVote}
        // Nom fixe, l'état est dit par aria-pressed (« Voter : …, enfoncé ») : un nom qui change le dirait deux fois (A11Y-30).
        aria-pressed={voted}
        aria-label={voteLabel(item.title, item.votes)}
        // aria-disabled plutôt que disabled : un bouton désactivé perd le focus (A11Y-19) ; vote() ignore déjà le double clic.
        aria-disabled={busy || undefined}
        className={cn(
          "flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-lg text-sm font-semibold ring-1 transition-colors",
          voted ? "bg-accent-brand text-accent-brand-foreground ring-accent-brand" : "bg-background text-foreground ring-foreground/15 hover:ring-accent-brand hover:text-accent-brand",
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
          {status && <Badge className={cn(item.status === "done" && "bg-oa text-oa-foreground", item.status === "planned" && "bg-tint text-accent-brand", item.status === "declined" && "bg-muted text-muted-foreground")}>{status}</Badge>}
          {item.createdAt && <span className="text-xs text-muted-foreground">{DATE_SHORT.format(new Date(item.createdAt))}</span>}
          {/* Nom accessible qui commence par le texte visible (WCAG 2.5.3) et dit quel sujet est visé. */}
          <a href={reportLink} aria-label={`Signaler le sujet « ${item.title} »`} className="link-quiet ml-auto text-xs text-muted-foreground">
            Signaler
          </a>
        </div>
        <h2 className="title-display mt-1.5 text-lg leading-snug">{item.title}</h2>
        {item.description && (
          <>
            <p id={descriptionId} className={cn("mt-1 max-w-measure-text whitespace-pre-line text-meta leading-relaxed text-muted-foreground", long && !expanded && "line-clamp-3")}>{item.description}</p>
            {long && (
              <Button variant="link" size="inline" onClick={() => setExpanded((e) => !e)} className="mt-1 text-sm" aria-expanded={expanded} aria-controls={descriptionId}>
                {expanded ? "Réduire" : "Lire la suite"}
              </Button>
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
        <DialogTitle className="title-display">Nouveau sujet</DialogTitle>
        <DialogDescription className="text-meta text-muted-foreground">
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
  /** Envoi tenté avec un titre trop court : l'indication passe en erreur (A11Y-21). */
  const [showError, setShowError] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const kindName = useId();
  const length = feedbackTitleLength(title);
  const valid = length >= MIN_FEEDBACK_TITLE;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    // « Publier » reste actif : un bouton grisé ne dirait pas pourquoi. Le refus est expliqué sous le champ, qui reprend le focus.
    if (!valid) {
      // Rendu immédiat : le champ doit porter l'erreur (aria-invalid, indication) quand il reçoit le focus.
      flushSync(() => setShowError(true));
      // Déjà dans le champ (Entrée) : le focus ne bouge pas, l'indication ne serait pas relue, on l'annonce.
      if (document.activeElement === titleRef.current) announce(feedbackTitleHint(length, true));
      else titleRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const { item } = await api<{ item?: FeedbackItem }>("/api/feedback", { method: "POST", json: { kind, title, description }, fallback: "La publication a échoué." });
      if (!item) throw new Error();
      onCreated(item);
      toast.success(frSpaces(kind === "bug" ? "Bug signalé, merci !" : "Idée publiée, merci !"));
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, "La publication a échoué."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-1 flex flex-col gap-3">
      {/* Boutons radio natifs : un seul arrêt de tabulation, les flèches changent le type (A11Y-30). */}
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="sr-only">Type de sujet</legend>
        {([
          ["bug", "Un bug", "Quelque chose ne marche pas", BugIcon],
          ["idea", "Une idée", "Une amélioration, une fonctionnalité", LightbulbIcon],
        ] as const).map(([value, label, hint, Icon]) => (
          <label
            key={value}
            className={cn(
              "relative flex cursor-pointer flex-col items-start gap-0.5 rounded-xl p-3 text-left ring-1 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2",
              kind === value ? "bg-tint ring-2 ring-accent-brand" : "ring-border hover:ring-[color-mix(in_oklch,var(--brand)_40%,var(--border))]",
            )}
          >
            <input type="radio" name={kindName} value={value} checked={kind === value} onChange={() => setKind(value)} className="sr-only" />
            <span className="flex items-center gap-1.5 font-medium"><Icon className="size-4" aria-hidden /> {label}</span>
            <span className="text-xs text-muted-foreground">{hint}</span>
          </label>
        ))}
      </fieldset>
      <Field label="Titre" hint={feedbackTitleHint(length, showError && !valid)} invalid={showError && !valid}>
        {(control) => (
          <Input
            {...control}
            ref={titleRef}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- champ d'un formulaire que l'utilisateur vient d'ouvrir : le focus y est attendu.
            autoFocus
            aria-required="true"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_FEEDBACK_TITLE}
            placeholder={kind === "bug" ? "Ex. Le PDF ne s'affiche pas sur iPhone" : "Ex. Exporter une liste au format RIS"}
            className="text-base md:text-base"
          />
        )}
      </Field>
      <Field label="Description" optional>
        {(control) => (
          <Textarea
            {...control}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={MAX_FEEDBACK_DESCRIPTION}
            rows={4}
            placeholder={kind === "bug" ? "Ce que vous faisiez, ce qui s'est passé, sur quel appareil" : "À quoi ça vous servirait"}
            className="text-base md:text-meta"
          />
        )}
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
        <Button type="submit" disabled={busy}>{busy && <Loader2Icon className="animate-spin" />} Publier</Button>
      </div>
    </form>
  );
}
