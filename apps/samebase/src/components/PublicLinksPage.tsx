import { SAMEBASE_PUBLIC_LINKS } from "@/lib/publicLinks";

export function PublicLinksPage() {
  return (
    <main className="container px-2 py-8" data-testid="public-links-page">
      <div className="mx-auto max-w-3xl pb-8">
        <h1 className="text-2xl font-semibold tracking-tight">/links</h1>
        <nav aria-label="Official Samebase links" className="mt-8 flex flex-col gap-4">
          {Object.values(SAMEBASE_PUBLIC_LINKS).map((link) => (
            <a
              className="flex items-baseline justify-between gap-4 underline-offset-4 hover:underline"
              href={link.path}
              key={link.path}
              rel="noreferrer"
              target="_blank"
            >
              <span className="font-mono text-lg">{link.path}</span>
              <span className="text-sm text-muted-foreground">{link.label}</span>
            </a>
          ))}
        </nav>
      </div>
    </main>
  );
}
