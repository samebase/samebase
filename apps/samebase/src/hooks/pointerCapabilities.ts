import { useSyncExternalStore } from "react";

type PointerCapabilityStore = {
  getSnapshot: () => boolean;
  subscribe: (onStoreChange: () => void) => () => void;
};

function readServerPointerCapability() {
  return false;
}

function createPointerCapabilityStore(mediaQuery: string): PointerCapabilityStore {
  let mediaQueryList: MediaQueryList | null = null;
  const subscribers = new Set<() => void>();

  const getMediaQueryList = () => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return null;
    }

    mediaQueryList ??= window.matchMedia(mediaQuery);
    return mediaQueryList;
  };
  const notifySubscribers = () => {
    for (const subscriber of subscribers) {
      subscriber();
    }
  };

  return {
    getSnapshot: () => getMediaQueryList()?.matches ?? false,
    subscribe: (onStoreChange) => {
      const activeMediaQueryList = getMediaQueryList();
      if (!activeMediaQueryList) {
        return () => {};
      }

      subscribers.add(onStoreChange);
      if (subscribers.size === 1) {
        activeMediaQueryList.addEventListener("change", notifySubscribers);
      }

      return () => {
        subscribers.delete(onStoreChange);
        if (subscribers.size === 0) {
          activeMediaQueryList.removeEventListener("change", notifySubscribers);
          mediaQueryList = null;
        }
      };
    },
  };
}

const touchFirstCoarsePointer = createPointerCapabilityStore("(hover: none) and (pointer: coarse)");
const anyFineHoverPointer = createPointerCapabilityStore(
  "(any-hover: hover) and (any-pointer: fine)",
);
const primaryFineHoverPointer = createPointerCapabilityStore("(hover: hover) and (pointer: fine)");
const routeEditorTouchScrollPointer = createPointerCapabilityStore(
  "(hover: none), (pointer: coarse)",
);

function usePointerCapability(store: PointerCapabilityStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, readServerPointerCapability);
}

/** True when the primary pointer is coarse and does not support hover. */
export function useTouchFirstCoarsePointer() {
  return usePointerCapability(touchFirstCoarsePointer);
}

/** True when any available pointer supports precise hover interaction. */
export function useAnyFineHoverPointer() {
  return usePointerCapability(anyFineHoverPointer);
}

/** True when the primary pointer supports precise hover interaction. */
export function usePrimaryFineHoverPointer() {
  return usePointerCapability(primaryFineHoverPointer);
}

/** True when the route editor should use its touch-scroll suggestion picker. */
export function useRouteEditorTouchScrollPointer() {
  return usePointerCapability(routeEditorTouchScrollPointer);
}
