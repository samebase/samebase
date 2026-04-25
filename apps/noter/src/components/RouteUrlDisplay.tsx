import { useLocation } from "@tanstack/react-router";

export function RouteUrlDisplay() {
  const location = useLocation();
  const currentHref = location.href;

  return (
    <p
      className="line-clamp-2 break-all font-mono text-sm leading-4 select-all"
      data-testid="route-url-display"
      title={currentHref}
    >
      {currentHref}
    </p>
  );
}
