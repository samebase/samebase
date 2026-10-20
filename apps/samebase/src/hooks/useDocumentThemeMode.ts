import { useSyncExternalStore } from "react";

export type DocumentThemeMode = "dark" | "light";

function readDocumentThemeMode(): DocumentThemeMode {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function readServerDocumentThemeMode(): DocumentThemeMode {
  return "light";
}

function subscribeToDocumentThemeMode(onThemeModeChange: () => void) {
  const observer = new MutationObserver(onThemeModeChange);
  observer.observe(document.documentElement, {
    attributeFilter: ["class"],
    attributes: true,
  });

  return () => {
    observer.disconnect();
  };
}

export function useDocumentThemeMode(): DocumentThemeMode {
  // The server cannot see the theme the head script applies before hydration (the stored or system
  // theme, and `?light` or `?dark` on prerendered pages), so the server and hydration renders use
  // "light" and later renders read the `<html>` class.
  return useSyncExternalStore(
    subscribeToDocumentThemeMode,
    readDocumentThemeMode,
    readServerDocumentThemeMode,
  );
}
