import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";

type NavigationControlsSnapshot = {
  canGoBack: boolean;
  canGoForward: boolean;
};

function readNavigationControlsSnapshot(): NavigationControlsSnapshot {
  if (typeof window === "undefined") {
    return {
      canGoBack: false,
      canGoForward: false,
    };
  }

  return {
    canGoBack: window.navigation.canGoBack,
    canGoForward: window.navigation.canGoForward,
  };
}

export function useNavigationControls() {
  const location = useLocation();
  const [snapshot, setSnapshot] = useState<NavigationControlsSnapshot>({
    canGoBack: false,
    canGoForward: false,
  });

  useEffect(() => {
    const updateSnapshot = () => {
      setSnapshot(readNavigationControlsSnapshot());
    };

    updateSnapshot();

    window.navigation.addEventListener("currententrychange", updateSnapshot);
    window.navigation.addEventListener("entrieschange", updateSnapshot);
    window.navigation.addEventListener("navigatesuccess", updateSnapshot);

    return () => {
      window.navigation.removeEventListener("currententrychange", updateSnapshot);
      window.navigation.removeEventListener("entrieschange", updateSnapshot);
      window.navigation.removeEventListener("navigatesuccess", updateSnapshot);
    };
  }, [location.href]);

  return snapshot;
}
