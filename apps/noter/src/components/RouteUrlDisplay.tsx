import { useLocation } from "@tanstack/react-router";

export function RouteUrlDisplay() {
  const location = useLocation();
  const currentHref = location.href;

  return (
    <input
      aria-label="Route URL"
      className="min-w-0 flex-1 bg-transparent font-mono text-sm"
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
