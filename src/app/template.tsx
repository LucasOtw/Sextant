import { PageTransition } from "@/components/page-transition";

/** Remonté à chaque navigation : anime l'entrée de chaque page (sauf le tout premier rendu, voir PageTransition). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
