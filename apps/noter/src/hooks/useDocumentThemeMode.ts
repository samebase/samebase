import { useEffect, useState } from "react";

export type DocumentThemeMode = "dark" | "light";

function readDocumentThemeMode(): DocumentThemeMode {
  if (typeof document === "undefined") {
    return "light";
  }

  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function useDocumentThemeMode(): DocumentThemeMode {
  const [themeMode, setThemeMode] = useState<DocumentThemeMode>(() =>
    readDocumentThemeMode(),
  );

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const syncThemeMode = () => {
      setThemeMode(readDocumentThemeMode());
    };

    syncThemeMode();

    const observer = new MutationObserver(syncThemeMode);
    observer.observe(document.documentElement, {
      attributeFilter: ["class"],
      attributes: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return themeMode;
}
