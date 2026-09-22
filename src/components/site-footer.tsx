export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          Données bibliographiques :{" "}
          <a href="https://openalex.org" className="underline underline-offset-2 hover:text-foreground" target="_blank" rel="noreferrer">
            OpenAlex
          </a>{" "}
          (CC0). Sourcier n'héberge aucun PDF : les liens pointent vers l'éditeur ou une archive ouverte.
        </p>
        <p>Les résumés IA sont indicatifs — la source fait foi.</p>
      </div>
    </footer>
  );
}
