export function SamebaseAttribution() {
  return (
    <a
      href="https://samebase.com"
      target="_blank"
      rel="noopener noreferrer"
      className="text-muted-foreground hover:text-foreground focus-visible:outline-ring group inline-flex min-h-11 items-center px-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <span className="inline-flex items-center gap-1 border-b border-transparent group-hover:border-current">
        Managed with{" "}
        <span className="text-foreground inline-flex items-center gap-1 whitespace-nowrap font-bold">
          <img src="/samebase.svg" alt="" width={15} height={15} className="dark:invert" />
          Samebase
        </span>
      </span>
    </a>
  );
}
