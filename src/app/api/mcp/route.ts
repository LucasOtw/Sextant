import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyKey } from "@/lib/api-keys";
import { registerSextantTools } from "@/lib/mcp-tools";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Serveur MCP de Sextant (Streamable HTTP, sans état). Authentification par clé personnelle, créée depuis « Mon compte » :
 * en-tête `Authorization: Bearer sxt_…`, ou paramètre `?key=sxt_…` pour les clients qui ne savent pas envoyer d'en-tête.
 */
const handler = createMcpHandler(
  (server) => {
    registerSextantTools(server);
  },
  {
    serverInfo: { name: "sextant", version: "1.0.0" },
    instructions:
      "Sextant donne accès à des publications scientifiques vérifiées (OpenAlex) et à la bibliothèque personnelle de l'utilisateur : favoris, listes, citations surlignées avec leur page, notes. Cite toujours la source (référence APA fournie) et renvoie vers la fiche Sextant de l'article.",
  },
);

const authed = withMcpAuth(
  handler,
  async (req, bearer) => {
    const key = bearer ?? new URL(req.url).searchParams.get("key") ?? undefined;
    if (!key) return undefined;
    const found = await verifyKey(key).catch(() => null);
    if (!found) return undefined;
    if (!rateLimit(`mcp:${found.keyId}`, 240, 60_000)) return undefined;
    return { token: key, clientId: `sextant-key:${found.keyId.slice(0, 12)}`, scopes: ["read"], extra: { uid: found.uid } };
  },
  { required: true },
);

export { authed as GET, authed as POST, authed as DELETE };
