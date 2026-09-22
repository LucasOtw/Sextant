import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { THEMES } from "@/lib/themes";
import { cn } from "cn";

export function ThemeGrid({ limit, className }: { limit?: number; className?: string }) {
  const themes = limit ? THEMES.slice(0, limit) : THEMES;
  return (
    <ul className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4", className)}>
      {themes.map((t) => (
        <li key={t.slug}>
          <Link
            href={`/theme/${t.slug}`}
            className="group flex h-full flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-accent-brand/40"
          >
            <span className={cn("size-3 rounded-full", t.tone)} aria-hidden />
            <span className="text-[17px] font-semibold leading-tight">{t.name}</span>
            <span className="text-sm leading-snug text-muted-foreground">{t.description}</span>
            <ArrowRightIcon className="mt-auto size-4 self-end text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
