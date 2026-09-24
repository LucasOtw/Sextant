"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon, KeyRoundIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MAX_API_KEY_NAME, MAX_API_KEYS, type ApiKeyInfo } from "@/lib/api-keys-shared";

const DATE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });

function CopyBlock({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="relative min-w-0">
        <pre className={`max-w-full overflow-x-auto rounded-lg bg-muted p-3 pr-24 text-xs leading-relaxed ${secret ? "select-all" : ""}`}><code>{value}</code></pre>
        <Button
          size="sm"
          variant="outline"
          className="absolute right-2 top-2 bg-card"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              toast.error("Presse-papiers indisponible : sélectionnez le texte.");
            }
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copié" : "Copier"}
        </Button>
      </div>
    </div>
  );
}

/** Clés personnelles pour brancher Sextant à un assistant IA (MCP) : créer, voir une seule fois, révoquer. */
export function McpKeys() {
  const [keys, setKeys] = useState<ApiKeyInfo[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ key: string; info: ApiKeyInfo } | null>(null);
  const [origin, setOrigin] = useState("https://sextant-psi.vercel.app");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- l'origine n'est connue qu'au navigateur
    setOrigin(window.location.origin);
    fetch("/api/account/keys", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { keys: ApiKeyInfo[] }) => setKeys(d.keys))
      .catch(() => setKeys([]));
  }, []);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/account/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
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

  const endpoint = `${origin}/api/mcp`;
  const full = keys !== null && keys.length >= MAX_API_KEYS;

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        Donnez à Claude, ChatGPT ou un autre assistant compatible MCP l'accès, en lecture seule, à votre bibliothèque Sextant (favoris,
        listes, citations, notes) et à la recherche d'articles. Chaque assistant reçoit sa propre clé, révocable à tout moment.
      </p>

      {keys === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2Icon className="size-4 animate-spin" aria-hidden /> Chargement…</p>
      ) : keys.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-lg ring-1 ring-foreground/10">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium"><KeyRoundIcon className="size-4 text-accent-brand" aria-hidden /> {k.name}</p>
                <p className="text-xs text-muted-foreground">
                  <code>{k.prefix}…</code>
                  {k.createdAt && <> · créée le {DATE.format(new Date(k.createdAt))}</>}
                  {" · "}{k.lastUsedAt ? `utilisée le ${DATE.format(new Date(k.lastUsedAt))}` : "jamais utilisée"}
                </p>
              </div>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => void revoke(k)} aria-label={`Révoquer la clé ${k.name}`}>
                <Trash2Icon /> Révoquer
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && !full) void create();
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_API_KEY_NAME} placeholder="Nom de la clé (ex. Claude sur mon Mac)" aria-label="Nom de la clé" className="h-10 flex-1 text-base md:text-base" />
        <Button type="submit" className="h-10" disabled={busy || full}>
          {busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Créer une clé
        </Button>
      </form>
      {full && <p className="text-sm text-muted-foreground">Limite de {MAX_API_KEYS} clés atteinte : révoquez-en une pour en créer une autre.</p>}

      <details className="text-sm">
        <summary className="font-medium">Comment brancher Sextant à mon assistant ?</summary>
        <div className="mt-3 flex flex-col gap-2 text-muted-foreground">
          <p>Adresse du serveur MCP : <code className="text-foreground">{endpoint}</code>, avec votre clé dans l'en-tête <code>Authorization: Bearer sxt_…</code>.</p>
          <p>Créez une clé : les instructions s'affichent alors avec votre clé déjà insérée, pour Claude Code, Claude Desktop, claude.ai et ChatGPT.</p>
        </div>
      </details>

      <Dialog open={created !== null} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent className="max-h-[90dvh] min-w-0 overflow-x-hidden overflow-y-auto sm:max-w-2xl">
          <DialogTitle className="title-display text-2xl">Votre clé « {created?.info.name} »</DialogTitle>
          <DialogDescription className="text-[15px] text-muted-foreground">
            Copiez-la maintenant : elle ne sera plus jamais affichée. Traitez-la comme un mot de passe ; en cas de doute, révoquez-la et créez-en une autre.
          </DialogDescription>
          {created && (
            <div className="mt-2 flex min-w-0 flex-col gap-4">
              <CopyBlock label="Clé" value={created.key} secret />
              <CopyBlock label="Claude Code (terminal)" value={`claude mcp add --transport http sextant ${endpoint} --header "Authorization: Bearer ${created.key}"`} secret />
              <CopyBlock
                label="Claude Desktop — fichier claude_desktop_config.json"
                value={JSON.stringify(
                  { mcpServers: { sextant: { command: "npx", args: ["-y", "mcp-remote", endpoint, "--header", "Authorization:${SEXTANT_AUTH}"], env: { SEXTANT_AUTH: `Bearer ${created.key}` } } } },
                  null,
                  2,
                )}
                secret
              />
              <div className="flex min-w-0 flex-col gap-1.5">
                <CopyBlock label="claude.ai, ChatGPT et autres connecteurs sans champ d'en-tête — adresse à coller" value={`${endpoint}?key=${created.key}`} secret />
                <p className="text-xs text-muted-foreground">
                  Cette adresse contient la clé : ne la partagez pas. Dans claude.ai : Réglages → Connecteurs → Ajouter un connecteur personnalisé.
                  Dans ChatGPT : Réglages → Connecteurs (mode développeur) → Créer, sans authentification.
                </p>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setCreated(null)}>J'ai copié ma clé</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
