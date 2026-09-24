import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyKey } from "@/lib/api-keys";
import { registerSextantTools } from "@/lib/mcp-tools";
import { clientIp, rateLimit } from "@/lib/rate-limit";

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

/**
 * Clés vérifiées par `entry` pour la requête en cours : withMcpAuth transforme tout refus ou toute exception de sa
 * vérification en 401 « invalid_token ». Le tri (503, 429, 401) se fait donc avant, et withMcpAuth ne fait que relire.
 */
const verified = new WeakMap<Request, { uid: string; keyId: string }>();

const authed = withMcpAuth(
  handler,
  async (req) => {
    const found = verified.get(req);
    if (!found) return undefined;
    return { token: "sxt", clientId: `sextant-key:${found.keyId.slice(0, 12)}`, scopes: ["read"], extra: { uid: found.uid } };
  },
  { required: true },
);

function jsonRpcError(status: number, message: string, retryAfter: number) {
  return Response.json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }, { status, headers: { "retry-after": String(retryAfter) } });
}

/**
 * 401 pour une clé absente ou inconnue, sans le `resource_metadata` qu'ajoute withMcpAuth : Sextant n'a pas (encore)
 * de serveur OAuth, et l'URL annoncée (/.well-known/oauth-protected-resource) renverrait 404. Le client reçoit à la
 * place la marche à suivre. Le jour où OAuth 2.1 arrive, publier cette route avec `protectedResourceHandler` de
 * mcp-handler et laisser withMcpAuth répondre lui-même.
 */
function missingKey() {
  return Response.json(
    {
      error: "invalid_token",
      error_description:
        "Clé Sextant manquante ou invalide : créez-en une dans Mon compte puis passez-la en Authorization: Bearer sxt_… ou ?key=sxt_…",
    },
    // Valeur d'en-tête en ASCII : les caractères accentués n'y sont pas fiables.
    { status: 401, headers: { "www-authenticate": 'Bearer error="invalid_token", error_description="Cle Sextant manquante ou invalide"' } },
  );
}

/** En-tête `Authorization: Bearer sxt_…`, sinon paramètre `?key=`. */
function keyOf(req: Request): string | null {
  const [scheme, value] = req.headers.get("authorization")?.split(" ") ?? [];
  if (scheme?.toLowerCase() === "bearer" && value) return value;
  return new URL(req.url).searchParams.get("key");
}

/**
 * Point d'entrée : 429 quand une limite est dépassée, 503 si la vérification de la clé échoue (Firestore), 401 (sans
 * annonce OAuth) seulement pour une clé absente ou inconnue. Un client MCP ne croit donc pas sa clé révoquée pour une rafale ou une panne passagère.
 */
async function entry(req: Request): Promise<Response> {
  const key = keyOf(req);
  if (!key) return missingKey();
  // Avant toute lecture Firestore : chaque clé bien formée, même fausse, coûte une lecture (limite par instance).
  if (!rateLimit(`mcp-ip:${clientIp(req)}`, 300, 60_000)) return jsonRpcError(429, "Trop de requêtes, réessayez dans une minute.", 60);
  let found: { uid: string; keyId: string } | null;
  try {
    found = await verifyKey(key);
  } catch (e) {
    console.error("[mcp] vérification de la clé impossible", e);
    return jsonRpcError(503, "Service momentanément indisponible, réessayez dans un instant.", 5);
  }
  if (!found) return missingKey();
  // Par compte et non par clé : les cinq clés possibles d'un compte partagent le même compteur.
  if (!rateLimit(`mcp:${found.uid}`, 90, 60_000)) return jsonRpcError(429, "Trop de requêtes, réessayez dans une minute.", 60);
  verified.set(req, found);
  return authed(req);
}

export { entry as GET, entry as POST, entry as DELETE };
