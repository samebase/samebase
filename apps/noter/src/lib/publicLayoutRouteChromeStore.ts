import { createContext, useSyncExternalStore, type ReactNode } from "react";
import type { PublicLayoutShellProps } from "@/Layout";
import type { WorkspaceLayoutV2PaneFrameProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";

type PublicLayoutRoutePaneFrame = Omit<WorkspaceLayoutV2PaneFrameProps, "content">;

export type PublicLayoutRouteChromeConfig = Omit<
  PublicLayoutShellProps,
  "children" | "left" | "main"
> & {
  left?: PublicLayoutRoutePaneFrame & { content: ReactNode };
  main?: PublicLayoutRoutePaneFrame;
};

type PublicLayoutRouteChromeSnapshot = Omit<PublicLayoutRouteChromeConfig, "left"> & {
  left?: PublicLayoutRoutePaneFrame;
};

type PublicLayoutRouteChromeListener = () => void;

const defaultPublicLayoutRouteChromeSnapshot = {};

function arePublicLayoutRoutePaneFramesEqual(
  left: PublicLayoutRoutePaneFrame | undefined,
  right: PublicLayoutRoutePaneFrame | undefined,
) {
  return (
    left?.footer === right?.footer &&
    left?.header === right?.header &&
    left?.headerTestId === right?.headerTestId
  );
}

function arePublicLayoutRouteChromeSnapshotsEqual(
  left: PublicLayoutRouteChromeSnapshot,
  right: PublicLayoutRouteChromeSnapshot,
) {
  return (
    left.dataTestId === right.dataTestId &&
    left.defaultLeftOpen === right.defaultLeftOpen &&
    left.defaultMobilePane === right.defaultMobilePane &&
    left.leftToggleVisibility === right.leftToggleVisibility &&
    left.rightToggleVisibility === right.rightToggleVisibility &&
    left.showRightSidebar === right.showRightSidebar &&
    arePublicLayoutRoutePaneFramesEqual(left.left, right.left) &&
    arePublicLayoutRoutePaneFramesEqual(left.main, right.main)
  );
}

function toPublicLayoutRouteChromeSnapshot(
  config: PublicLayoutRouteChromeConfig | null,
): PublicLayoutRouteChromeSnapshot {
  if (config === null) {
    return defaultPublicLayoutRouteChromeSnapshot;
  }

  const { left, ...snapshot } = config;
  if (left === undefined) {
    return snapshot;
  }

  const leftFrame = {
    footer: left.footer,
    header: left.header,
    headerTestId: left.headerTestId,
  } satisfies PublicLayoutRoutePaneFrame;
  return {
    ...snapshot,
    left: leftFrame,
  };
}

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

    const nextSnapshot = toPublicLayoutRouteChromeSnapshot(config);
    if (!arePublicLayoutRouteChromeSnapshotsEqual(snapshot, nextSnapshot)) {
      snapshot = nextSnapshot;
      notifySnapshotListeners();
    }

    const nextLeftContent = config?.left?.content ?? null;
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
