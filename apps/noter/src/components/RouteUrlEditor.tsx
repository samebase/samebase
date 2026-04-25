import { useLocation, useRouter } from "@tanstack/react-router";
import { resolveEditableRouteHref } from "@/lib/routeUrlEditor";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";

const INVALID_ROUTE_URL_TITLE = "Use an app path or same-origin URL";

function getCurrentOrigin(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.location.origin;
}

export function RouteUrlEditor() {
  const location = useLocation();
  const router = useRouter();
  const currentHref = location.href;
  const [draftHref, setDraftHref] = useState(currentHref);
  const [isInvalid, setIsInvalid] = useState(false);

  useEffect(() => {
    setDraftHref(currentHref);
    setIsInvalid(false);
  }, [currentHref]);

  const submitDraftHref = () => {
    const nextHref = resolveEditableRouteHref(draftHref, getCurrentOrigin());

    if (!nextHref.ok) {
      setIsInvalid(true);
      return;
    }

    setIsInvalid(false);
    if (nextHref.href === currentHref) {
      return;
    }

    void router.navigate({
      href: nextHref.href,
      state: true,
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitDraftHref();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    setDraftHref(currentHref);
    setIsInvalid(false);
  };

  return (
    <form className="w-full min-w-0" onSubmit={handleSubmit}>
      <input
        aria-invalid={isInvalid}
        aria-label="Route URL"
        autoCapitalize="none"
        autoCorrect="off"
        className="w-full min-w-0 bg-transparent p-0 font-mono text-xs text-muted-foreground outline-none focus:text-foreground aria-invalid:text-destructive"
        data-testid="route-url-editor"
        inputMode="url"
        onBlur={submitDraftHref}
        onChange={(event) => {
          setDraftHref(event.currentTarget.value);
          setIsInvalid(false);
        }}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        title={isInvalid ? INVALID_ROUTE_URL_TITLE : currentHref}
        type="text"
        value={draftHref}
      />
    </form>
  );
}
