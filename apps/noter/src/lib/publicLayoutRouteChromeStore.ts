import { createContext, useSyncExternalStore, type ReactNode } from "react";

export type PublicLayoutRouteChromeConfig = {
  left?: ReactNode;
};

export type PublicLayoutRouteChromeSnapshot = { hasLeft: boolean };

type PublicLayoutRouteChromeListener = () => void;

const defaultPublicLayoutRouteChromeSnapshot = { hasLeft: false };

export type PublicLayoutRouteChromeStore = {
  getLeftContentSnapshot: () => ReactNode;
  getSnapshot: () => PublicLayoutRouteChromeSnapshot;
  register: (id: symbol, config: PublicLayoutRouteChromeConfig) => void;
  subscribeLeftContent: (listener: PublicLayoutRouteChromeListener) => () => void;
  subscribeSnapshot: (listener: PublicLayoutRouteChromeListener) => () => void;
  unregister: (id: symbol) => void;
  update: (id: symbol, config: PublicLayoutRouteChromeConfig) => void;
};

export function createPublicLayoutRouteChromeStore(): PublicLayoutRouteChromeStore {
  let activeId: symbol | null = null;
  let snapshot: PublicLayoutRouteChromeSnapshot = defaultPublicLayoutRouteChromeSnapshot;
  let leftContent: ReactNode = null;
  const snapshotListeners = new Set<PublicLayoutRouteChromeListener>();
  const leftContentListeners = new Set<PublicLayoutRouteChromeListener>();

  const notifySnapshotListeners = () => {
    snapshotListeners.forEach((listener) => listener());
  };
  const notifyLeftContentListeners = () => {
    leftContentListeners.forEach((listener) => listener());
  };
  const setConfig = (id: symbol, config: PublicLayoutRouteChromeConfig | null) => {
    activeId = config === null ? null : id;

    const nextSnapshot = { hasLeft: config?.left !== undefined };
    if (snapshot.hasLeft !== nextSnapshot.hasLeft) {
      snapshot = nextSnapshot;
      notifySnapshotListeners();
    }

    const nextLeftContent = config?.left ?? null;
    if (leftContent !== nextLeftContent) {
      leftContent = nextLeftContent;
      notifyLeftContentListeners();
    }
  };

  return {
    getLeftContentSnapshot: () => leftContent,
    getSnapshot: () => snapshot,
    register: (id, config) => {
      setConfig(id, config);
    },
    subscribeLeftContent: (listener) => {
      leftContentListeners.add(listener);
      return () => {
        leftContentListeners.delete(listener);
      };
    },
    subscribeSnapshot: (listener) => {
      snapshotListeners.add(listener);
      return () => {
        snapshotListeners.delete(listener);
      };
    },
    unregister: (id) => {
      if (activeId === id) {
        setConfig(id, null);
      }
    },
    update: (id, config) => {
      if (activeId === id) {
        setConfig(id, config);
      }
    },
  };
}

export const PublicLayoutRouteChromeContext = createContext<PublicLayoutRouteChromeStore | null>(
  null,
);

export function usePublicLayoutRouteChromeSnapshot(store: PublicLayoutRouteChromeStore) {
  return useSyncExternalStore(store.subscribeSnapshot, store.getSnapshot, store.getSnapshot);
}
