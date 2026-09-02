export function RepositoryMaintenancePage() {
  return (
    <main
      data-testid="repository-maintenance-page"
      className="flex min-h-dvh flex-col bg-background px-6 py-10 text-foreground"
      aria-live="polite"
    >
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-2">
        <h1 className="text-xl font-medium">Samebase is under maintenance</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Your repositories and provider connections are safe. Samebase will return here when the
          maintenance work is complete.
        </p>
      </div>
    </main>
  );
}
