import { clsx } from "clsx";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { highlightMatches, rankFuzzyPathMatches } from "@/lib/fuzzySearch.tsx";

export function VaultRepositoryRootInput({
  disabled,
  folderSuggestions,
  onValueChange,
  value,
}: {
  disabled: boolean;
  folderSuggestions: readonly string[];
  onValueChange: (value: string) => void;
  value: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const suggestionListId = useId();
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number | null>(null);
  const suggestionMatches = useMemo(
    () =>
      rankFuzzyPathMatches({
        paths: folderSuggestions,
        query: value,
        limit: 8,
      }),
    [folderSuggestions, value],
  );
  const showSuggestions = suggestionsOpen && suggestionMatches.length > 0;
  const activeSuggestionIndex =
    selectedSuggestionIndex === null || suggestionMatches.length === 0
      ? null
      : Math.min(selectedSuggestionIndex, suggestionMatches.length - 1);
  const selectedSuggestion =
    showSuggestions && activeSuggestionIndex !== null
      ? suggestionMatches[activeSuggestionIndex]
      : undefined;
  const activeSuggestionId = selectedSuggestion
    ? `${suggestionListId}-${activeSuggestionIndex}`
    : undefined;

  useEffect(() => {
    const handleDocumentPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      const container = containerRef.current;
      if (container && !container.contains(event.target)) {
        setSuggestionsOpen(false);
        setSelectedSuggestionIndex(null);
      }
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown);
  }, []);

  const selectSuggestion = (folderPath: string) => {
    onValueChange(folderPath);
    setSuggestionsOpen(false);
    setSelectedSuggestionIndex(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        if (suggestionMatches.length > 0) {
          event.preventDefault();
          setSuggestionsOpen(true);
          setSelectedSuggestionIndex((current) =>
            current === null || !suggestionsOpen
              ? 0
              : Math.min(current + 1, suggestionMatches.length - 1),
          );
        }
        return;
      case "ArrowUp":
        if (suggestionMatches.length > 0) {
          event.preventDefault();
          setSuggestionsOpen(true);
          setSelectedSuggestionIndex((current) =>
            current === null || !suggestionsOpen
              ? suggestionMatches.length - 1
              : Math.max(current - 1, 0),
          );
        }
        return;
      case "Enter":
        if (selectedSuggestion) {
          event.preventDefault();
          selectSuggestion(selectedSuggestion.path);
        }
        return;
      case "Escape":
        if (suggestionsOpen) {
          event.preventDefault();
          event.stopPropagation();
          setSuggestionsOpen(false);
          setSelectedSuggestionIndex(null);
        }
        return;
    }
  };

  return (
    <div ref={containerRef} className="relative grid gap-1.5">
      <Label htmlFor={inputId}>Repository root</Label>
      <Input
        id={inputId}
        role="combobox"
        aria-activedescendant={activeSuggestionId}
        aria-autocomplete="list"
        aria-controls={showSuggestions ? suggestionListId : undefined}
        aria-expanded={showSuggestions}
        autoComplete="off"
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          setSuggestionsOpen(true);
          setSelectedSuggestionIndex(null);
        }}
        onFocus={() => {
          setSuggestionsOpen(true);
          setSelectedSuggestionIndex(null);
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      {showSuggestions ? (
        <div
          id={suggestionListId}
          role="listbox"
          aria-label="Repository folder suggestions"
          className="corner-notch-1 absolute top-full z-50 mt-1 max-h-56 w-full overflow-y-auto border bg-popover text-popover-foreground shadow-md"
        >
          {suggestionMatches.map((suggestion, index) => (
            <button
              key={suggestion.path}
              id={`${suggestionListId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeSuggestionIndex}
              className={clsx(
                "block w-full cursor-pointer truncate px-3 py-2 text-left font-mono text-sm hover:bg-accent hover:text-accent-foreground",
                index === activeSuggestionIndex && "bg-accent text-accent-foreground",
              )}
              onPointerDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => selectSuggestion(suggestion.path)}
            >
              {highlightMatches(suggestion.path, suggestion.matches)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
