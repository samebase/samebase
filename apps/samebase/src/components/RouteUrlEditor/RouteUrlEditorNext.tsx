import { useEffect } from "react";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import {
  ROUTE_SEARCH_PARAM_SUGGESTION_GROUPS,
  type RouteSearchParamSuggestionGroup,
} from "@/routing/permissions";
import { LOGO_PRESENTATION_TILT_SUSPEND_ATTRIBUTE } from "@/components/logo/logoPresentationTilt";
import { Badge } from "@/components/ui/badge";
import { useRouteEditorVm } from "./useRouteEditorVm";
import type { Suggestion } from "./RouteUrlEditorSuggestions";
import { readRouteEditorNavigationApi, useNavigationControls } from "./useNavigationControls";
import { useRouteUrlEditorPageHashSuggestions } from "./useRouteUrlEditorPageHashSuggestions";
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

const routeUrlEditorNextDevSuggestionButtonClassName = `${routeUrlEditorNextSuggestionButtonClassName} bg-sky-500/5 dark:bg-sky-400/5`;

const routeUrlEditorNextTouchDevSuggestionButtonClassName = `${routeUrlEditorNextTouchSuggestionButtonClassName} bg-sky-500/5 dark:bg-sky-400/5`;

const routeUrlEditorNextSuggestionSampleClassName =
  "text-muted-foreground group-data-[active=true]:text-accent-foreground/60";

const routeUrlEditorNextDevBadgeClassName =
  "h-4 border-sky-500/40 bg-sky-500/10 px-1.5 py-0 text-[10px] text-sky-700 dark:border-sky-400/40 dark:bg-sky-400/10 dark:text-sky-300";

const routeUrlEditorNextSuggestionGroupLabelClassName =
  "mt-2 flex h-7 items-center px-2 text-sm font-bold";

const routeUrlEditorNextSuggestionGroupLabels = {
  theme: "Theme",
  logo: "Logo",
  "logo-motion": "Logo motion",
  "logo-view": "Logo view",
} satisfies Record<RouteSearchParamSuggestionGroup, string>;

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
  const pageHashKeys = useRouteUrlEditorPageHashSuggestions();
  const vm = useRouteEditorVm({ pageHashKeys });
  const { canGoBack, canGoForward } = useNavigationControls();
  const touchScrollPicker = useRouteUrlEditorTouchScrollPicker({
    currentSuggestionIndex: vm.currentSuggestionIndex,
    currentSuggestionScrollEnabled: vm.state.kind === "focused" && vm.state.focusMode === "editing",
    previewedTouchSuggestionIndex:
      vm.state.kind === "focused" &&
      vm.state.focusMode === "suggestion" &&
      vm.state.previewRoute.source === "touch"
        ? vm.state.previewRoute.suggestionIndex
        : null,
    previewTouchSuggestion: vm.previewTouchSuggestion,
    suggestions: vm.suggestions,
    suggestionsVisible: vm.suggestionsVisible,
  });
  const resetTouchScrollPosition = touchScrollPicker.resetScrollPosition;
  const inputFocused = vm.state.kind === "focused";
  const inputProps = inputFocused ? vm.inputProps : vm.displayInputProps;
  const editingDraftRouteAddress =
    vm.state.kind === "focused" && vm.state.focusMode === "editing"
      ? vm.state.draftRouteAddress
      : null;
  const activeTouchSuggestion =
    touchScrollPicker.active && vm.state.kind === "focused" && vm.state.focusMode === "suggestion"
      ? (vm.suggestions[vm.state.previewRoute.suggestionIndex] ?? null)
      : null;
  const firstGroupedSuggestionIndex = vm.suggestions.findIndex(
    (suggestion) => suggestion.kind === "search" && suggestion.group !== null,
  );
  const ungroupedSuggestionCount =
    firstGroupedSuggestionIndex === -1 ? vm.suggestions.length : firstGroupedSuggestionIndex;

  function renderSuggestionRows(
    suggestionRows: readonly Suggestion[],
    firstSuggestionIndex: number,
  ) {
    return suggestionRows.map((suggestion, relativeSuggestionIndex) => {
      const suggestionIndex = firstSuggestionIndex + relativeSuggestionIndex;
      const suggestionProps = vm.getSuggestionProps(suggestion, suggestionIndex);

      return (
        <button
          className={
            suggestion.dev
              ? touchScrollPicker.active
                ? routeUrlEditorNextTouchDevSuggestionButtonClassName
                : routeUrlEditorNextDevSuggestionButtonClassName
              : touchScrollPicker.active
                ? routeUrlEditorNextTouchSuggestionButtonClassName
                : routeUrlEditorNextSuggestionButtonClassName
          }
          data-route-url-editor-suggestion-index={suggestionIndex}
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
          <span
            className="min-w-0 flex-1 truncate text-left"
            data-testid="route-url-editor-suggestion-value"
          >
            {renderRouteUrlEditorNextSuggestionValue(suggestion)}
          </span>
          {suggestion.dev ? (
            <Badge
              aria-hidden="true"
              className={routeUrlEditorNextDevBadgeClassName}
              variant="outline"
            >
              dev
            </Badge>
          ) : null}
        </button>
      );
    });
  }

  useEffect(() => {
    if (editingDraftRouteAddress === null || touchScrollPicker.enabled) {
      return;
    }

    resetTouchScrollPosition();
  }, [editingDraftRouteAddress, resetTouchScrollPosition, touchScrollPicker.enabled]);

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
      {...{ [LOGO_PRESENTATION_TILT_SUSPEND_ATTRIBUTE]: "" }}
      className="relative flex h-7 w-full min-w-0 items-center gap-1 px-1 text-foreground"
      data-testid="route-url-editor"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <label
        className="sr-only"
        htmlFor={inputFocused ? vm.inputProps.id : vm.displayInputProps.id}
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
      {/* Blurred display stays route-only so prerender origins cannot over-indent the route; focused
      mode reuses this input with the runtime-origin URL so iOS opens the keyboard for the tapped
      field. */}
      <input
        {...inputProps}
        autoComplete="off"
        className={
          inputFocused ? routeUrlEditorNextInputClassName : routeUrlEditorNextBlurredInputClassName
        }
        data-1p-ignore="true"
        data-bwignore="true"
        data-form-type="other"
        data-lpignore="true"
        data-op-ignore="true"
        data-testid={inputFocused ? "route-url-editor-input" : "route-url-editor-display"}
        inputMode="url"
        spellCheck={false}
        style={inputFocused ? { textIndent: `-${vm.state.prefix.length - 1}ch` } : undefined}
        title={inputProps.title}
        value={inputProps.value}
      />
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
            {renderSuggestionRows(vm.suggestions.slice(0, ungroupedSuggestionCount), 0)}
            {ROUTE_SEARCH_PARAM_SUGGESTION_GROUPS.map((group) => {
              const firstSuggestionIndex = vm.suggestions.findIndex(
                (suggestion) => suggestion.kind === "search" && suggestion.group === group,
              );
              if (firstSuggestionIndex === -1) {
                return null;
              }

              const suggestionRows = vm.suggestions.filter(
                (suggestion) => suggestion.kind === "search" && suggestion.group === group,
              );
              const label = routeUrlEditorNextSuggestionGroupLabels[group];

              return (
                <div aria-label={label} key={group} role="group">
                  <div
                    aria-hidden="true"
                    className={routeUrlEditorNextSuggestionGroupLabelClassName}
                  >
                    {label}
                  </div>
                  {renderSuggestionRows(suggestionRows, firstSuggestionIndex)}
                </div>
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
