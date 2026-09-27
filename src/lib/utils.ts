// Relais exigé par components.json (aliases.utils) : le CLI shadcn et les composants de registres tiers importent
// `cn` depuis « @/lib/utils ». Le code du projet l'importe de « @/lib/cn » (tailles de police du thème déclarées).
// Ne pas supprimer (QUAL-28).
export { cn } from "./cn"
