import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { useRouteEditorVm } from "./useRouteEditorVm";

const routeUrlEditorNextIconButtonClassName =
  "flex size-7 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

// iOS WebKit zooms focused text controls below 16 CSS px, which breaks the route editor chrome.
const routeUrlEditorNextInputClassName =
  "h-7 min-w-0 flex-1 border-0 bg-transparent px-1 font-mono text-base leading-7 outline-none selection:bg-primary/20 aria-invalid:text-destructive";

const routeUrlEditorNextBlurredInputClassName = `${routeUrlEditorNextInputClassName} cursor-text hover:bg-muted`;

const routeUrlEditorNextSuggestionsPopoverClassName =
  "absolute inset-x-1 top-full z-50 mt-1 overflow-hidden rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10";

const routeUrlEditorNextSuggestionsScrollportClassName = "relative max-h-72 overflow-y-auto py-1";

const routeUrlEditorNextSuggestionButtonClassName =
  "flex h-7 w-full min-w-0 items-center px-2 font-mono text-sm text-foreground outline-none focus-visible:bg-accent focus-visible:text-accent-foreground data-[active=true]:bg-accent data-[active=true]:text-accent-foreground";

export function RouteUrlEditorNext() {
  const router = useRouter();
  const vm = useRouteEditorVm({});

  useEffect(() => {
    if (!vm.activeSuggestionId) {
      return;
    }

    // aria-activedescendant keeps focus on the input, so the active option must scroll itself.
    document.getElementById(vm.activeSuggestionId)?.scrollIntoView({ block: "nearest" });
  }, [vm.activeSuggestionId]);

  return (
    <form
      {...vm.rootProps}
      className="relative flex h-8 w-full min-w-0 items-center gap-1 bg-background px-1 text-foreground"
      data-testid="route-url-editor"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <label className="sr-only" htmlFor={vm.inputProps.id}>
        Route URL
      </label>
      <button
        aria-label="Back"
        className={routeUrlEditorNextIconButtonClassName}
        onClick={() => router.history.back()}
        title="Back"
        type="button"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
      </button>
      <button
        aria-label="Forward"
        className={routeUrlEditorNextIconButtonClassName}
        onClick={() => router.history.forward()}
        title="Forward"
        type="button"
      >
        <ArrowRight aria-hidden="true" className="size-4" />
      </button>
      <button
        aria-label="Refresh"
        className={routeUrlEditorNextIconButtonClassName}
        onClick={() => window.location.reload()}
        title="Refresh"
        type="button"
      >
        <RefreshCw aria-hidden="true" className="size-4" />
      </button>
      <input
        {...vm.inputProps}
        className={
          vm.state.kind === "focused"
            ? routeUrlEditorNextInputClassName
            : routeUrlEditorNextBlurredInputClassName
        }
        data-testid={
          vm.state.kind === "focused" ? "route-url-editor-input" : "route-url-editor-display"
        }
        inputMode="url"
        spellCheck={false}
        style={{ textIndent: `-${vm.state.prefix.length - 1}ch` }}
      />
      {vm.suggestionsVisible ? (
        <div
          className={routeUrlEditorNextSuggestionsPopoverClassName}
          data-testid="route-url-editor-suggestions-popover"
        >
          <div
            {...vm.listboxProps}
            className={routeUrlEditorNextSuggestionsScrollportClassName}
            data-testid="route-url-editor-suggestions"
            role="listbox"
          >
            {vm.suggestions.map((suggestion, suggestionIndex) => (
              <button
                className={routeUrlEditorNextSuggestionButtonClassName}
                data-testid="route-url-editor-suggestion"
                key={`${suggestion.kind}:${suggestion.value}`}
                {...vm.getSuggestionProps(suggestion, suggestionIndex)}
                role="option"
                type="button"
              >
                <span className="min-w-0 flex-1 truncate text-left">{suggestion.value}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </form>
  );
}
