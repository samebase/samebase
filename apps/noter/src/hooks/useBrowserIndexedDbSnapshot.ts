import { useEffect, useState } from "react";
import { readBrowserIndexedDbSnapshot, type IndexedDbSnapshot } from "@/lib/indexedDbSnapshot";

const loadingSnapshot = {
  kind: "loading",
} satisfies IndexedDbSnapshot;

/**
 * IndexedDB has no same-tab storage event, so this refreshes on mount and when
 * the page becomes active again after possible writes elsewhere in the app.
 */
export function useBrowserIndexedDbSnapshot(): IndexedDbSnapshot {
  const [snapshot, setSnapshot] = useState<IndexedDbSnapshot>(loadingSnapshot);

  useEffect(() => {
    let active = true;

    const readSnapshot = () => {
      setSnapshot(loadingSnapshot);
      void (async () => {
        const nextSnapshot = await readBrowserIndexedDbSnapshot();
        if (active) {
          setSnapshot(nextSnapshot);
        }
      })();
    };

    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") {
        readSnapshot();
      }
    };

    readSnapshot();
    window.addEventListener("focus", readSnapshot);
    document.addEventListener("visibilitychange", refreshOnVisible);

    return () => {
      active = false;
      window.removeEventListener("focus", readSnapshot);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, []);

  return snapshot;
}
