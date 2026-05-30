export const routeUrlEditorXStateStoreEventTypes = [
  "routeUrlEditor.clearTouchScrollPickerMetrics",
  "routeUrlEditor.patchSuggestionState",
  "routeUrlEditor.setDocumentHashSuggestionKeys",
  "routeUrlEditor.setDraftRouteAddress",
  "routeUrlEditor.setInputFocused",
  "routeUrlEditor.setTouchScrollPickerEnabled",
  "routeUrlEditor.syncTouchScrollPickerMetrics",
  "routeUrlEditor.updateRouteHistoryIndexes",
  "routeUrlEditor.updateSuggestionState",
] as const;

export type RouteUrlEditorXStateStoreEventType =
  (typeof routeUrlEditorXStateStoreEventTypes)[number];
