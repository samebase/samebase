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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 60 60"
            width={15}
            height={15}
            shapeRendering="crispEdges"
            className="dark:invert"
            aria-hidden="true"
          >
            <rect width="60" height="60" fill="#ffffff" />
            <path d="M6 6h48v48H6z M22 22h16v16H22z" fill="#394447" fillRule="evenodd" />
          </svg>
          Samebase
        </span>
      </span>
    </a>
  );
}
