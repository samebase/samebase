import { createContext, useSyncExternalStore, type ReactNode } from "react";

export type PublicLayoutRouteChromeConfig = {
  left?: ReactNode;
};

type PublicLayoutRouteChromeListener = () => void;

export type PublicLayoutRouteChromeStore = {
  getLeftContentSnapshot: () => ReactNode;
  register: (id: symbol, config: PublicLayoutRouteChromeConfig) => void;
  subscribeLeftContent: (listener: PublicLayoutRouteChromeListener) => () => void;
  unregister: (id: symbol) => void;
  update: (id: symbol, config: PublicLayoutRouteChromeConfig) => void;
};

export function createPublicLayoutRouteChromeStore(): PublicLayoutRouteChromeStore {
  let activeId: symbol | null = null;
  let leftContent: ReactNode = null;
  const leftContentListeners = new Set<PublicLayoutRouteChromeListener>();

  const notifyLeftContentListeners = () => {
    leftContentListeners.forEach((listener) => listener());
  };
  const setConfig = (id: symbol, config: PublicLayoutRouteChromeConfig | null) => {
    activeId = config === null ? null : id;

    const nextLeftContent = config?.left ?? null;
    if (leftContent !== nextLeftContent) {
      leftContent = nextLeftContent;
      notifyLeftContentListeners();
    }
  };

  return {
    getLeftContentSnapshot: () => leftContent,
    register: (id, config) => {
      setConfig(id, config);
    },
    subscribeLeftContent: (listener) => {
      leftContentListeners.add(listener);
      return () => {
        leftContentListeners.delete(listener);
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

export function usePublicLayoutRouteLeftContent(store: PublicLayoutRouteChromeStore) {
  return useSyncExternalStore(
    store.subscribeLeftContent,
    store.getLeftContentSnapshot,
    store.getLeftContentSnapshot,
  );
}
