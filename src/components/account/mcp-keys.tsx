"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckIcon, CopyIcon, KeyRoundIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MAX_API_KEY_NAME, MAX_API_KEYS, type ApiKeyInfo } from "@/lib/api-keys-shared";
import { needsReauth, ReauthDialog } from "@/components/auth/reauth";
import { useClientValue } from "@/hooks/use-client-value";
import { useCopy } from "@/hooks/use-copy";
import { neighbourEquivalent } from "@/lib/focus";
import { DATE_SHORT } from "@/lib/dates";

const COPY_FAILURE = "Presse-papiers indisponible : sélectionnez le texte pour le copier.";

/** Bloc technique secondaire : libellé et bouton sur une ligne, texte en dessous, retour à la ligne plutôt que défilement. */
function CopyBlock({ label, value }: { label: string; value: string }) {
  const { copied, copy } = useCopy();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <Button size="sm" variant="ghost" onClick={() => void copy(value, { failure: COPY_FAILURE })}>
          {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copié" : "Copier"}
        </Button>
      </div>
      <pre className="max-w-full whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs leading-relaxed"><code>{value}</code></pre>
    </div>
  );
}

/** Ce qu'il faut coller dans Claude : l'adresse, en grand, avec un seul bouton. */
function ConnectorUrl({ url }: { url: string }) {
  const { copied, copy } = useCopy();
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-tint p-4 ring-1 ring-accent-brand/25">
      <p className="text-sm font-semibold">Adresse à coller dans Claude</p>
      <p className="select-all break-all rounded-lg bg-card px-3 py-2.5 font-mono text-[0.8125rem] leading-relaxed border border-border">{url}</p>
      <Button size="lg" className="w-full" onClick={() => void copy(url, { message: "Adresse copiée.", failure: COPY_FAILURE })}>
        {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Adresse copiée" : "Copier l'adresse"}
      </Button>
    </div>
  );
}

/** Clés personnelles pour brancher Sextant à un assistant IA (MCP) : créer, voir une seule fois, révoquer. */
export function McpKeys() {
  const [keys, setKeys] = useState<ApiKeyInfo[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ key: string; info: ApiKeyInfo } | null>(null);
  const [reauth, setReauth] = useState(false);
  /** Origine de la page, pour l'adresse du connecteur : celle de production au rendu serveur (QUAL-31). */
  const origin = useClientValue(() => window.location.origin, "https://sextant-psi.vercel.app");
  /** Clé dont la révocation attend confirmation (A11Y-24) : une clé révoquée ne se récupère pas. */
  const [revoking, setRevoking] = useState<ApiKeyInfo | null>(null);
  /** Ouverture de la confirmation, à part : le nom de la clé reste affiché pendant l'animation de fermeture. */
  const [confirming, setConfirming] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  /** Bouton « Révoquer » qui a ouvert la confirmation. */
  const revokeFrom = useRef<HTMLElement | null>(null);
  /**
   * Où rendre le focus à la fermeture de la confirmation : null (annulation) rend la main au bouton d'origine ; après une
   * révocation, « Révoquer » de la clé suivante, sinon de la précédente, sinon le champ « Nom de la clé » (A11Y-19).
   */
  const focusAfter = useRef<HTMLElement | null>(null);
  const limitId = useId();

  useEffect(() => {
    fetch("/api/account/keys", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { keys: ApiKeyInfo[] }) => setKeys(d.keys))
      .catch(() => setKeys([]));
  }, []);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/account/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
      // Connexion Google trop ancienne (SEC-09) : confirmation d'identité, puis la création est rejouée.
      if (await needsReauth(res)) {
        setReauth(true);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { key?: string; info?: ApiKeyInfo; error?: string };
      if (!res.ok || !data.key || !data.info) throw new Error(data.error ?? "La clé n'a pas pu être créée.");
      setCreated({ key: data.key, info: data.info });
      setKeys((k) => [data.info!, ...(k ?? [])]);
      setName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "La clé n'a pas pu être créée.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(k: ApiKeyInfo) {
    const previous = keys;
    setKeys((list) => (list ?? []).filter((x) => x.id !== k.id));
    try {
      const res = await fetch(`/api/account/keys/${k.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast("Clé révoquée.", { description: `« ${k.name} » ne donne plus accès à votre bibliothèque.` });
    } catch {
      setKeys(previous);
      toast.error("La révocation a échoué, réessayez.");
    }
  }

  function confirmRevoke() {
    const k = revoking;
    if (!k) return;
    focusAfter.current = neighbourEquivalent(listRef.current, ":scope > li", revokeFrom.current) ?? nameRef.current;
    setConfirming(false);
    void revoke(k);
  }

  const endpoint = `${origin}/api/mcp`;
  const full = keys !== null && keys.length >= MAX_API_KEYS;

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-5 border border-border">
      <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
        Donnez à Claude, ChatGPT ou un autre assistant compatible MCP l'accès, en lecture seule, à votre bibliothèque Sextant (favoris,
        listes, citations, notes) et à la recherche d'articles. Chaque assistant reçoit sa propre clé, révocable à tout moment.
      </p>

      {keys === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2Icon className="size-4 animate-spin" aria-hidden /> Chargement…</p>
      ) : keys.length > 0 ? (
        <ul ref={listRef} className="flex flex-col divide-y rounded-lg border border-border">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium"><KeyRoundIcon className="size-4 text-accent-brand" aria-hidden /> {k.name}</p>
                <p className="text-xs text-muted-foreground">
                  <code>{k.prefix}…</code>
                  {k.createdAt && <> · créée le {DATE_SHORT.format(new Date(k.createdAt))}</>}
                  {" · "}{k.lastUsedAt ? `utilisée le ${DATE_SHORT.format(new Date(k.lastUsedAt))}` : "jamais utilisée"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                data-focus-key="revoke"
                onClick={(e) => {
                  revokeFrom.current = e.currentTarget;
                  setRevoking(k);
                  setConfirming(true);
                }}
                aria-label={`Révoquer la clé ${k.name}`}
              >
                <Trash2Icon /> Révoquer
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && !full) void create();
        }}
      >
        <Field label="Nom de la clé" optional className="flex-1">
          {(control) => (
            <Input {...control} ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_API_KEY_NAME} placeholder="Ex. Claude sur mon Mac" className="h-10 text-base md:text-base" />
          )}
        </Field>
        {/* Bouton grisé à la limite : la raison lui est reliée (A11Y-21). */}
        <Button type="submit" className="h-10" disabled={busy || full} aria-describedby={full ? limitId : undefined}>
          {busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Créer une clé
        </Button>
      </form>
      {full && <p id={limitId} className="text-sm text-muted-foreground">Limite de {MAX_API_KEYS} clés atteinte : révoquez-en une pour en créer une autre.</p>}

      <details className="text-sm">
        <summary className="font-medium">Comment brancher Sextant à mon assistant ?</summary>
        <div className="mt-3 flex flex-col gap-2 text-muted-foreground">
          <p>Créez une clé : une adresse s'affiche, à coller dans Claude (Réglages → Connecteurs → Ajouter un connecteur personnalisé) ou dans ChatGPT.</p>
          <p>Pour Claude Code ou le fichier de configuration de Claude Desktop, les commandes prêtes à copier sont dans « Autres méthodes ».</p>
        </div>
      </details>

      <ReauthDialog
        open={reauth}
        onOpenChange={setReauth}
        description="Par sécurité, créer une clé demande une connexion Google récente : une clé donne accès à votre bibliothèque tant qu'elle n'est pas révoquée."
        onConfirmed={() => void create()}
      />

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent
          className="sm:max-w-sm"
          finalFocus={() => {
            const target = focusAfter.current;
            focusAfter.current = null;
            return target?.isConnected ? target : true;
          }}
        >
          <DialogTitle className="title-display text-2xl">Révoquer « {revoking?.name} » ?</DialogTitle>
          <DialogDescription className="text-[0.9375rem] text-muted-foreground">
            L'assistant qui utilise cette clé perdra immédiatement l'accès à votre bibliothèque. Il faudra créer une nouvelle clé et
            reconfigurer le connecteur.
          </DialogDescription>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)}>Annuler</Button>
            <Button variant="destructive" onClick={confirmRevoke}>
              <Trash2Icon /> Révoquer la clé
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={created !== null} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent className="max-h-[92dvh] min-w-0 overflow-x-hidden overflow-y-auto sm:max-w-lg">
          <DialogTitle className="title-display text-2xl">Votre clé est prête</DialogTitle>
          <DialogDescription className="text-[0.9375rem] leading-relaxed text-muted-foreground">
            Copiez l'adresse ci-dessous maintenant : elle contient votre clé et ne sera plus jamais affichée.
          </DialogDescription>
          {created && (
            <div className="mt-1 flex min-w-0 flex-col gap-5">
              <ConnectorUrl url={`${endpoint}?key=${created.key}`} />

              <ol className="flex flex-col gap-2.5 text-[0.9375rem]">
                {[
                  <>Dans Claude, ouvrez <strong>Réglages</strong>, puis <strong>Connecteurs</strong>.</>,
                  <>Cliquez sur <strong>Ajouter un connecteur personnalisé</strong>.</>,
                  <>Nom : <strong>Sextant</strong>. URL : collez l'adresse. Laissez le reste vide, puis validez.</>,
                ].map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>

              <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                Même démarche dans ChatGPT : Réglages → Connecteurs → Créer (mode développeur), sans authentification.
                Cette adresse vaut mot de passe : ne la partagez pas. En cas de doute, révoquez la clé et créez-en une autre.
              </p>

              <details className="group text-sm">
                <summary className="text-muted-foreground hover:text-foreground">Autres méthodes (Claude Code, fichier de configuration de Claude Desktop, clé seule)</summary>
                <div className="mt-3 flex min-w-0 flex-col gap-4">
                  {/* La clé est lue par une saisie masquée : elle n'entre pas dans l'historique du shell (bash et zsh). Guillemets
                      doubles indispensables, sinon `$SEXTANT_KEY` partirait tel quel dans l'en-tête (SEC-22). */}
                  <CopyBlock
                    label="Claude Code, dans le terminal"
                    value={`printf 'Clé Sextant : '; read -rs SEXTANT_KEY; echo; claude mcp add --transport http sextant ${endpoint} --header "Authorization: Bearer $SEXTANT_KEY"; unset SEXTANT_KEY`}
                  />
                  <p className="-mt-2 text-muted-foreground">
                    Quand le terminal demande la clé, collez celle du bloc « Clé seule » : elle ne s'affiche pas et ne reste pas dans l'historique. Claude Code la garde ensuite dans sa configuration (~/.claude.json) : en cas de doute, révoquez-la.
                  </p>
                  <CopyBlock
                    label="Claude Desktop, fichier claude_desktop_config.json"
                    value={JSON.stringify(
                      { mcpServers: { sextant: { command: "npx", args: ["-y", "mcp-remote@latest", endpoint, "--header", "Authorization:${SEXTANT_AUTH}"], env: { SEXTANT_AUTH: `Bearer ${created.key}` } } } },
                      null,
                      2,
                    )}
                  />
                  <CopyBlock label="Clé seule" value={created.key} />
                </div>
              </details>

              <Button variant="outline" size="lg" className="w-full" onClick={() => setCreated(null)}>C'est fait</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
