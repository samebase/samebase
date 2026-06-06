import type { Suggestion } from "./RouteUrlEditorSuggestions";

export type ActiveRouteEditorSuggestion = {
  id: string;
  index: number;
  suggestion: Suggestion;
};

type RouteEditorSuggestionArrowKey = "ArrowDown" | "ArrowUp";

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

export function readNextActiveRouteEditorSuggestion(args: {
  activeSuggestionIndex: number | null;
  arrowKey: RouteEditorSuggestionArrowKey;
  listboxId: string;
  suggestions: readonly Suggestion[];
}): ActiveRouteEditorSuggestion | null {
  if (args.suggestions.length === 0) {
    return null;
  }

  const nextIndex =
    args.arrowKey === "ArrowDown"
      ? args.activeSuggestionIndex === null
        ? 0
        : (args.activeSuggestionIndex + 1) % args.suggestions.length
      : args.activeSuggestionIndex === null
        ? args.suggestions.length - 1
        : (args.activeSuggestionIndex - 1 + args.suggestions.length) % args.suggestions.length;

  return readActiveRouteEditorSuggestion({
    activeSuggestionIndex: nextIndex,
    listboxId: args.listboxId,
    suggestions: args.suggestions,
  });
}
