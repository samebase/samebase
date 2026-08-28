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

const anyFineHoverPointer = createPointerCapabilityStore(
  "(any-hover: hover) and (any-pointer: fine)",
);

export function useAnyFineHoverPointer() {
  return useSyncExternalStore(
    anyFineHoverPointer.subscribe,
    anyFineHoverPointer.getSnapshot,
    readServerPointerCapability,
  );
}
