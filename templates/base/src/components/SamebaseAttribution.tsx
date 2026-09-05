export function SamebaseAttribution() {
  return (
    <a
      href="https://samebase.com"
      target="_blank"
      rel="noopener noreferrer"
      className="text-muted-foreground hover:text-foreground focus-visible:outline-ring inline-flex min-h-11 items-center gap-1 px-2 text-xs underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      Managed with{" "}
      <span className="text-foreground whitespace-nowrap font-bold">
        <img
          src="/samebase.svg"
          alt=""
          width={20}
          height={20}
          className="inline-block size-[calc(1em*10/9)] align-[-0.125em] dark:invert"
        />
        {"\u00a0"}
        Samebase
      </span>
    </a>
  );
}
