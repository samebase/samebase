import { useLocation, useRouter } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useCallback, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeRouteUrlEditorHref } from "@/lib/routeUrlEditor";

function readRouteUrlEditorOrigin(): string {
  return typeof window === "undefined" ? "https://noter.local" : window.location.origin;
}

export function RouteUrlEditor() {
  const location = useLocation();
  const router = useRouter();
  const currentHref = location.href;
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [invalidInput, setInvalidInput] = useState(false);

  const clearInvalidInput = useCallback(() => {
    if (invalidInput) {
      setInvalidInput(false);
    }
  }, [invalidInput]);

  const resetInput = useCallback(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    input.value = currentHref;
    setInvalidInput(false);
  }, [currentHref]);

  const commitInput = useCallback(
    (rawHref: string) => {
      const result = normalizeRouteUrlEditorHref({
        currentHref,
        origin: readRouteUrlEditorOrigin(),
        rawHref,
      });

      if (result.status === "invalid") {
        setInvalidInput(true);
        return;
      }

      const input = inputRef.current;
      if (input) {
        input.value = result.href;
      }
      setInvalidInput(false);

      if (result.href === currentHref) {
        return;
      }

      void router.navigate({
        href: result.href,
      });
    },
    [currentHref, router],
  );

  const submitInput = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const input = inputRef.current;
      if (!input) {
        return;
      }

      commitInput(input.value);
    },
    [commitInput],
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Escape") {
        return;
      }

      resetInput();
      event.currentTarget.blur();
    },
    [resetInput],
  );

  return (
    <form
      className="flex min-w-0 items-center gap-1"
      data-testid="route-url-editor"
      onSubmit={submitInput}
    >
      <label className="sr-only" htmlFor={inputId}>
        Route URL
      </label>
      {/*
        Keep typing uncontrolled: URL changes remount the input, but ordinary
        keystrokes do not copy address text through React state.
      */}
      <Input
        key={currentHref}
        ref={inputRef}
        aria-describedby={invalidInput ? `${inputId}-error` : undefined}
        aria-invalid={invalidInput}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        className="h-7 rounded-none border-transparent bg-transparent px-1.5 py-0 font-mono text-sm leading-4 shadow-none focus-visible:border-ring"
        data-testid="route-url-editor-input"
        defaultValue={currentHref}
        id={inputId}
        inputMode="url"
        name="routeHref"
        onInput={clearInvalidInput}
        onKeyDown={handleInputKeyDown}
        spellCheck={false}
        title={currentHref}
        type="text"
      />
      <Button
        aria-label="Go to route URL"
        className="rounded-none"
        size="icon-xs"
        title="Go to route URL"
        type="submit"
        variant="ghost"
      >
        <ArrowRight aria-hidden="true" />
      </Button>
      {invalidInput ? (
        <span className="sr-only" id={`${inputId}-error`}>
          Enter a same-origin app URL.
        </span>
      ) : null}
    </form>
  );
}
