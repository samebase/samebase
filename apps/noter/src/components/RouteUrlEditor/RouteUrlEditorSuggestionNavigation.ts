import type { Suggestion } from "./RouteUrlEditorSuggestions";

export type ActiveRouteEditorSuggestion = {
  id: string;
  index: number;
  suggestion: Suggestion;
};

export type RouteEditorSuggestionArrowKey = "ArrowDown" | "ArrowUp";

export function readRouteEditorSuggestionId(listboxId: string, suggestionIndex: number): string {
  return `${listboxId}-option-${suggestionIndex}`;
}

export function readActiveRouteEditorSuggestion(args: {
  activeSuggestionIndex: number | null;
  listboxId: string;
  suggestions: readonly Suggestion[];
}): ActiveRouteEditorSuggestion | null {
  if (
    args.activeSuggestionIndex === null ||
    args.activeSuggestionIndex < 0 ||
    args.activeSuggestionIndex >= args.suggestions.length
  ) {
    return null;
  }

  const suggestion = args.suggestions[args.activeSuggestionIndex];
  // oxlint-disable-next-line typescript/no-unnecessary-condition
  if (!suggestion) {
    return null;
  }

  return {
    id: readRouteEditorSuggestionId(args.listboxId, args.activeSuggestionIndex),
    index: args.activeSuggestionIndex,
    suggestion,
  };
}

export function readNextRouteEditorSuggestionIndex(args: {
  activeSuggestionIndex: number | null;
  arrowKey: RouteEditorSuggestionArrowKey;
  suggestionCount: number;
}): number | null {
  if (args.suggestionCount === 0) {
    return null;
  }

  if (args.arrowKey === "ArrowDown") {
    return args.activeSuggestionIndex === null
      ? 0
      : (args.activeSuggestionIndex + 1) % args.suggestionCount;
  }

  return args.activeSuggestionIndex === null
    ? args.suggestionCount - 1
    : (args.activeSuggestionIndex - 1 + args.suggestionCount) % args.suggestionCount;
}

export function readNextActiveRouteEditorSuggestion(args: {
  activeSuggestionIndex: number | null;
  arrowKey: RouteEditorSuggestionArrowKey;
  listboxId: string;
  suggestions: readonly Suggestion[];
}): ActiveRouteEditorSuggestion | null {
  const nextIndex = readNextRouteEditorSuggestionIndex({
    activeSuggestionIndex: args.activeSuggestionIndex,
    arrowKey: args.arrowKey,
    suggestionCount: args.suggestions.length,
  });
  if (nextIndex === null) {
    return null;
  }

  return readActiveRouteEditorSuggestion({
    activeSuggestionIndex: nextIndex,
    listboxId: args.listboxId,
    suggestions: args.suggestions,
  });
}
