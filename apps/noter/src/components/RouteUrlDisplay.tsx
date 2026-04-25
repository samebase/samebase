import { useLocation } from "@tanstack/react-router";

export function RouteUrlDisplay() {
  const location = useLocation();
  const currentHref = location.href;

  return (
    <input
      aria-label="Route URL"
      className="w-full min-w-0 cursor-text select-all bg-transparent p-0 font-mono text-xs text-muted-foreground outline-none focus:text-foreground"
      data-testid="route-url-display"
      onFocus={(event) => {
        event.currentTarget.select();
      }}
      readOnly
      spellCheck={false}
      title={currentHref}
      type="text"
      value={currentHref}
    />
  );
}
