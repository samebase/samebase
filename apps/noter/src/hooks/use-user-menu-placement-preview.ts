import { useCallback, useEffect, useState } from "react";

export type UserMenuPlacementPreview = "sidebar" | "top-strip" | "floating";

const STORAGE_KEY = "noter:user-menu-placement-preview";
const EVENT_NAME = "noter:user-menu-placement-preview-change";
const DEFAULT_VARIANT: UserMenuPlacementPreview = "sidebar";

function isVariant(value: string | null): value is UserMenuPlacementPreview {
  return value === "sidebar" || value === "top-strip" || value === "floating";
}

function readVariant(): UserMenuPlacementPreview {
  if (typeof window === "undefined") {
    return DEFAULT_VARIANT;
  }
  const value = window.localStorage.getItem(STORAGE_KEY);
  return isVariant(value) ? value : DEFAULT_VARIANT;
}

function persistVariant(variant: UserMenuPlacementPreview) {
  window.localStorage.setItem(STORAGE_KEY, variant);
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function useUserMenuPlacementPreview() {
  const [variant, setVariantState] = useState<UserMenuPlacementPreview>(
    () => readVariant(),
  );

  useEffect(() => {
    const syncFromStorage = () => {
      setVariantState(readVariant());
    };

    window.addEventListener(EVENT_NAME, syncFromStorage);
    window.addEventListener("storage", syncFromStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, syncFromStorage);
      window.removeEventListener("storage", syncFromStorage);
    };
  }, []);

  const setVariant = useCallback((next: UserMenuPlacementPreview) => {
    setVariantState(next);
    persistVariant(next);
  }, []);

  return [variant, setVariant] as const;
}
