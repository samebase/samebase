import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";

type NavigationControlsSnapshot = {
  canGoBack: boolean;
  canGoForward: boolean;
};

export function readRouteEditorNavigationApi(): Navigation | null {
  if (typeof window === "undefined" || !("navigation" in window)) {
    return null;
  }

  return window.navigation;
}

function readNavigationControlsSnapshot(): NavigationControlsSnapshot {
  const navigation = readRouteEditorNavigationApi();
  if (!navigation) {
    return {
      canGoBack: false,
      canGoForward: false,
    };
  }

  return {
    canGoBack: navigation.canGoBack,
    canGoForward: navigation.canGoForward,
  };
}

export function useNavigationControls() {
  const location = useLocation();
  const [snapshot, setSnapshot] = useState<NavigationControlsSnapshot>({
    canGoBack: false,
    canGoForward: false,
  });

  useEffect(() => {
    const navigation = readRouteEditorNavigationApi();
    if (!navigation) {
      return;
    }

    const updateSnapshot = () => {
      setSnapshot(readNavigationControlsSnapshot());
    };

    updateSnapshot();

    navigation.addEventListener("currententrychange", updateSnapshot);
    navigation.addEventListener("entrieschange", updateSnapshot);
    navigation.addEventListener("navigatesuccess", updateSnapshot);

    return () => {
      navigation.removeEventListener("currententrychange", updateSnapshot);
      navigation.removeEventListener("entrieschange", updateSnapshot);
      navigation.removeEventListener("navigatesuccess", updateSnapshot);
    };
  }, [location.href]);

  return snapshot;
}
