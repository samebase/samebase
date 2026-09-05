export function SamebaseAttribution() {
  return (
    <a
      href="https://samebase.com"
      target="_blank"
      rel="noopener noreferrer"
      className="text-muted-foreground hover:text-foreground focus-visible:outline-ring inline-flex min-h-11 items-center gap-1 px-2 text-xs underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      Managed with{" "}
      <span className="inline-flex items-center gap-1">
        <img src="/samebase.svg" alt="" width={16} height={16} className="size-4 dark:invert" />
        Samebase
      </span>
    </a>
  );
}
