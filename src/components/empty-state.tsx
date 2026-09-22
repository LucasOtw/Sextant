export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center">
      <p className="text-lg font-medium">{title}</p>
      {hint && <p className="mt-1 text-base text-muted-foreground">{hint}</p>}
    </div>
  );
}
