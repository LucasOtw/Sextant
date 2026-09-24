/** Clés personnelles pour le serveur MCP : ce que le client voit d'une clé (jamais la clé elle-même après sa création). */
export interface ApiKeyInfo {
  /** Empreinte SHA-256 de la clé (sert d'identifiant ; la clé ne se retrouve pas à partir d'elle). */
  id: string;
  name: string;
  /** Début de la clé, pour la reconnaître (« sxt_Ab12… »). */
  prefix: string;
  createdAt: string | null;
  lastUsedAt: string | null;
}

export const MAX_API_KEYS = 5;
export const MAX_API_KEY_NAME = 40;
export const API_KEY_FORMAT = /^sxt_[A-Za-z0-9_-]{43}$/;
export const API_KEY_ID = /^[a-f0-9]{64}$/;
