import { useEffect } from "react";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { useRouteEditorVm } from "./useRouteEditorVm";
import { readRouteEditorNavigationApi, useNavigationControls } from "./useNavigationControls";
import {
  routeUrlEditorTouchSuggestionRowHeightPx,
  useRouteUrlEditorTouchScrollPicker,
} from "./useRouteUrlEditorTouchScrollPicker";

const routeUrlEditorNextIconButtonClassName =
  "flex size-7 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

// iOS WebKit zooms focused text controls below 16 CSS px, which breaks the route editor chrome.
const routeUrlEditorNextInputClassName =
  "h-7 min-w-0 flex-1 border-0 bg-transparent px-1 font-mono text-base leading-7 outline-none selection:bg-primary/20 aria-invalid:text-destructive";

const routeUrlEditorNextBlurredInputClassName = `${routeUrlEditorNextInputClassName} cursor-text hover:bg-muted`;

const routeUrlEditorNextSuggestionsPopoverClassName =
  "absolute inset-x-1 top-[calc(100%-2px)] z-50 overflow-hidden rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10";

const routeUrlEditorNextTouchSuggestionsPopoverClassName =
  "absolute inset-x-1 top-[calc(100%-2px)] z-50 overflow-hidden rounded-md bg-background/35 text-popover-foreground shadow-md ring-1 ring-foreground/10 backdrop-blur-sm";

const routeUrlEditorNextSuggestionsScrollportClassName = "relative max-h-72 overflow-y-auto py-1";

const routeUrlEditorNextTouchSuggestionsScrollportClassName =
  "relative h-[min(18rem,calc(100dvh-4rem))] snap-y snap-mandatory overflow-y-auto overscroll-contain py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const routeUrlEditorNextSuggestionButtonClassName =
  "group flex h-7 w-full min-w-0 snap-start snap-always items-center px-2 font-mono text-sm text-foreground outline-none focus-visible:bg-accent focus-visible:text-accent-foreground data-[active=true]:bg-accent data-[active=true]:text-accent-foreground";

const routeUrlEditorNextTouchSuggestionButtonClassName = `${routeUrlEditorNextSuggestionButtonClassName} pr-24`;

const routeUrlEditorNextSuggestionSampleClassName =
  "text-muted-foreground group-data-[active=true]:text-accent-foreground/60";

const routeUrlEditorNextTouchScrollSlateClassName =
  "pointer-events-none absolute inset-x-0 z-10 border-y border-ring/70";

const routeUrlEditorNextTouchScrollApplyButtonClassName =
  "pointer-events-auto absolute right-1 top-1/2 h-6 -translate-y-1/2 bg-background px-2 text-xs font-medium text-foreground shadow-sm ring-1 ring-foreground/20";

function renderRouteUrlEditorNextSuggestionValue(suggestion: {
  sampleValueStart?: number;
  value: string;
}) {
  if (typeof suggestion.sampleValueStart !== "number") {
    return suggestion.value;
  }

  return (
    <>
      {suggestion.value.slice(0, suggestion.sampleValueStart)}
      <span className={routeUrlEditorNextSuggestionSampleClassName}>
        {suggestion.value.slice(suggestion.sampleValueStart)}
      </span>
    </>
  );
}

export function RouteUrlEditorNext() {
  const vm = useRouteEditorVm({});
  const { canGoBack, canGoForward } = useNavigationControls();
  const touchScrollPicker = useRouteUrlEditorTouchScrollPicker({
    previewTouchSuggestion: vm.previewTouchSuggestion,
    suggestions: vm.suggestions,
    suggestionsVisible: vm.suggestionsVisible,
  });
  const resetTouchScrollPosition = touchScrollPicker.resetScrollPosition;
  const editingDraftPath =
    vm.state.kind === "focused" && vm.state.focusMode === "editing" ? vm.state.draftPath : null;
  const activeTouchSuggestion =
    touchScrollPicker.active && vm.state.kind === "focused" && vm.state.focusMode === "suggestion"
      ? (vm.suggestions[vm.state.hoverPath.suggestionIndex] ?? null)
      : null;

  useEffect(() => {
    if (editingDraftPath === null) {
      return;
    }

    resetTouchScrollPosition();
  }, [editingDraftPath, resetTouchScrollPosition]);

  useEffect(() => {
    if (!vm.activeSuggestionId || touchScrollPicker.enabled) {
      return;
    }

    // On non-touch layouts, aria-activedescendant keeps focus on the input, so keyboard navigation
    // scrolls the active option with scrollIntoView.
    document.getElementById(vm.activeSuggestionId)?.scrollIntoView({ block: "nearest" });
  }, [touchScrollPicker.enabled, vm.activeSuggestionId]);

  return (
    <form
      {...vm.rootProps}
      className="relative flex h-8 w-full min-w-0 items-center gap-1 bg-background px-1 text-foreground"
      data-testid="route-url-editor"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <label
        className="sr-only"
        htmlFor={vm.state.kind === "focused" ? vm.inputProps.id : vm.displayInputProps.id}
      >
        Route URL
      </label>
      <button
        aria-label="Back"
        className={routeUrlEditorNextIconButtonClassName}
        disabled={!canGoBack}
        onClick={() => readRouteEditorNavigationApi()?.back()}
        title="Back"
        type="button"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
      </button>
      <button
        aria-label="Forward"
        className={routeUrlEditorNextIconButtonClassName}
        disabled={!canGoForward}
        onClick={() => readRouteEditorNavigationApi()?.forward()}
        title="Forward"
        type="button"
      >
        <ArrowRight aria-hidden="true" className="size-4" />
      </button>
      <button
        aria-label="Refresh"
        className={routeUrlEditorNextIconButtonClassName}
        onClick={vm.refreshPage}
        title="Refresh"
        type="button"
      >
        <RefreshCw aria-hidden="true" className="size-4" />
      </button>
      {vm.state.kind === "focused" ? (
        <input
          {...vm.inputProps}
          autoFocus
          className={routeUrlEditorNextInputClassName}
          data-testid="route-url-editor-input"
          inputMode="url"
          spellCheck={false}
          style={{ textIndent: `-${vm.state.prefix.length - 1}ch` }}
        />
      ) : (
        <input
          {...vm.displayInputProps}
          className={routeUrlEditorNextBlurredInputClassName}
          data-testid="route-url-editor-display"
          inputMode="url"
          spellCheck={false}
        />
      )}
      {vm.suggestionsVisible ? (
        <div
          className={
            touchScrollPicker.active
              ? routeUrlEditorNextTouchSuggestionsPopoverClassName
              : routeUrlEditorNextSuggestionsPopoverClassName
          }
          data-testid="route-url-editor-suggestions-popover"
        >
          {touchScrollPicker.active ? (
            <div
              aria-hidden={activeTouchSuggestion ? undefined : true}
              className={routeUrlEditorNextTouchScrollSlateClassName}
              data-testid="route-url-editor-scroll-slate"
              style={{
                height: routeUrlEditorTouchSuggestionRowHeightPx,
                top: touchScrollPicker.metrics.slateTopPx,
              }}
            >
              {activeTouchSuggestion ? (
                <button
                  aria-label={`Apply ${activeTouchSuggestion.value}`}
                  className={routeUrlEditorNextTouchScrollApplyButtonClassName}
                  data-testid="route-url-editor-touch-apply"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    touchScrollPicker.resetScrollPosition();
                    vm.selectSuggestion(activeTouchSuggestion);
                  }}
                  type="button"
                >
                  tap to apply
                </button>
              ) : null}
            </div>
          ) : null}
          <div
            {...vm.listboxProps}
            className={
              touchScrollPicker.enabled
                ? routeUrlEditorNextTouchSuggestionsScrollportClassName
                : routeUrlEditorNextSuggestionsScrollportClassName
            }
            data-testid="route-url-editor-suggestions"
            onScroll={touchScrollPicker.handleSuggestionsScroll}
            onTouchStart={touchScrollPicker.handleSuggestionsTouchStart}
            onWheel={touchScrollPicker.handleSuggestionsWheel}
            ref={touchScrollPicker.suggestionsRef}
            role="listbox"
            style={
              touchScrollPicker.active
                ? { scrollPaddingTop: touchScrollPicker.metrics.slateTopPx }
                : undefined
            }
          >
            {touchScrollPicker.active ? (
              <div
                aria-hidden="true"
                style={{ height: touchScrollPicker.metrics.topSpacerHeightPx }}
              />
            ) : null}
            {vm.suggestions.map((suggestion, suggestionIndex) => {
              const suggestionProps = vm.getSuggestionProps(suggestion, suggestionIndex);

              return (
                <button
                  className={
                    touchScrollPicker.active
                      ? routeUrlEditorNextTouchSuggestionButtonClassName
                      : routeUrlEditorNextSuggestionButtonClassName
                  }
                  data-testid="route-url-editor-suggestion"
                  key={`${suggestion.kind}:${suggestion.value}`}
                  {...suggestionProps}
                  onMouseDown={(event) => {
                    touchScrollPicker.resetScrollPosition();
                    suggestionProps.onMouseDown(event);
                  }}
                  role="option"
                  type="button"
                >
                  <span className="min-w-0 flex-1 truncate text-left">
                    {renderRouteUrlEditorNextSuggestionValue(suggestion)}
                  </span>
                </button>
              );
            })}
            {touchScrollPicker.active ? (
              <div
                aria-hidden="true"
                style={{ height: touchScrollPicker.metrics.bottomSpacerHeightPx }}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </form>
  );
}
