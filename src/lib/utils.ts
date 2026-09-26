// Relais exigé par components.json (aliases.utils) : le CLI shadcn et les composants de registres tiers importent
// `cn` depuis « @/lib/utils ». Le code du projet l'importe directement du paquet `cn`. Ne pas supprimer (QUAL-28).
export { cn } from "cn"
