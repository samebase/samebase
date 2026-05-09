// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";
import type { WorkspaceSidebarStateController } from "@/lib/workspaceSidebarStateController";
import { useLocalStorageWorkspaceSidebarState } from "./useLocalStorageWorkspaceSidebarState";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const STORAGE_KEY = "noter_test_public_sidebar_state";
const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "localStorage",
);
const DEFAULT_SIDEBAR_STATE = {
  leftDesktopOpen: false,
  leftDesktopWidthPx: 280,
  leftMobileWidthPx: 280,
  mobilePane: "main",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: true,
  rightDesktopWidthPx: 288,
  rightMobileWidthPx: 288,
} satisfies WorkspaceSidebarState;

const STORED_SIDEBAR_STATE = {
  ...DEFAULT_SIDEBAR_STATE,
  mobilePane: "right",
  rightDesktopWidthPx: 360,
} satisfies WorkspaceSidebarState;

let latestSidebarStateController: WorkspaceSidebarStateController | null = null;

function createTestStorage() {
  const entries = new Map<string, string>();

  return {
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(String(key)) ?? null;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    get length() {
      return entries.size;
    },
    removeItem(key: string) {
      entries.delete(String(key));
    },
    setItem(key: string, value: string) {
      entries.set(String(key), String(value));
    },
  } satisfies Storage;
}

function SidebarStateProbe({ reset = false }: { reset?: boolean }) {
  const sidebarState = useLocalStorageWorkspaceSidebarState({
    defaults: DEFAULT_SIDEBAR_STATE,
    reset,
    storageKey: STORAGE_KEY,
  });
  latestSidebarStateController = sidebarState;

  return (
    <div
      data-mobile-pane={sidebarState.state.mobilePane}
      data-right-width={`${sidebarState.state.rightDesktopWidthPx}`}
    />
  );
}

function getLatestSidebarStateController() {
  const controller = latestSidebarStateController;
  if (controller === null) {
    throw new Error("Expected sidebar state controller");
  }

  return controller;
}

function setLatestMobilePane(
  nextPane: React.SetStateAction<WorkspaceSidebarState["mobilePane"]>,
) {
  const controller = getLatestSidebarStateController();
  controller.setState(
    (state) => ({
      ...state,
      mobilePane:
        nextPane instanceof Function ? nextPane(state.mobilePane) : nextPane,
    }),
    "immediate",
  );
}

function setLatestMobileSurface(
  nextSurface: WorkspaceSidebarState["mobileSurface"],
) {
  const controller = getLatestSidebarStateController();
  controller.setState(
    (state) => ({
      ...state,
      mobileSurface: nextSurface,
    }),
    "immediate",
  );
}

function setLatestRightDesktopWidthPx(
  nextWidthPx: React.SetStateAction<number>,
) {
  const controller = getLatestSidebarStateController();
  controller.setState(
    (state) => ({
      ...state,
      rightDesktopWidthPx:
        nextWidthPx instanceof Function
          ? nextWidthPx(state.rightDesktopWidthPx)
          : nextWidthPx,
    }),
    "width_deferred",
  );
}

describe("useLocalStorageWorkspaceSidebarState", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createTestStorage(),
    });
  });

  afterEach(() => {
    latestSidebarStateController = null;
    if (root !== null) {
      const mountedRoot = root;
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }
    vi.useRealTimers();
    rootElement?.remove();
    rootElement = null;
    if (originalLocalStorageDescriptor) {
      Object.defineProperty(
        window,
        "localStorage",
        originalLocalStorageDescriptor,
      );
      return;
    }

    Reflect.deleteProperty(window, "localStorage");
  });

  function renderProbe({ reset = false }: { reset?: boolean } = {}) {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    act(() => {
      mountedRoot.render(<SidebarStateProbe reset={reset} />);
    });
  }

  it("hydrates anonymous sidebar preferences from localStorage", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: STORED_SIDEBAR_STATE,
        version: 2,
      }),
    );

    renderProbe();

    expect(
      rootElement?.firstElementChild?.getAttribute("data-mobile-pane"),
    ).toBe("right");
    expect(
      rootElement?.firstElementChild?.getAttribute("data-right-width"),
    ).toBe("360");
  });

  it("falls back to defaults for malformed localStorage payloads", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          ...STORED_SIDEBAR_STATE,
          rightDesktopWidthPx: "wide",
        },
        version: 2,
      }),
    );

    renderProbe();

    expect(
      rootElement?.firstElementChild?.getAttribute("data-mobile-pane"),
    ).toBe("main");
    expect(
      rootElement?.firstElementChild?.getAttribute("data-right-width"),
    ).toBe("288");
  });

  it("falls back to defaults for old localStorage payload versions", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: STORED_SIDEBAR_STATE,
        version: 1,
      }),
    );

    renderProbe();

    expect(
      rootElement?.firstElementChild?.getAttribute("data-mobile-pane"),
    ).toBe("main");
    expect(
      rootElement?.firstElementChild?.getAttribute("data-right-width"),
    ).toBe("288");
  });

  it("clears localStorage when the reset flag is active", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: STORED_SIDEBAR_STATE,
        version: 2,
      }),
    );

    renderProbe({ reset: true });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(
      rootElement?.firstElementChild?.getAttribute("data-mobile-pane"),
    ).toBe("main");
  });

  it("persists immediate pane changes to localStorage", () => {
    renderProbe();

    act(() => {
      setLatestMobilePane("left");
    });

    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    expect(storedValue).not.toBeNull();
    if (storedValue === null) {
      return;
    }

    expect(JSON.parse(storedValue)).toMatchObject({
      state: {
        mobilePane: "left",
      },
      version: 2,
    });
  });

  it("persists immediate mobile surface changes to localStorage", () => {
    renderProbe();

    act(() => {
      setLatestMobileSurface({
        kind: "merged",
        mainWidthPx: 294,
        side: "right",
      });
    });

    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    expect(storedValue).not.toBeNull();
    if (storedValue === null) {
      return;
    }

    expect(JSON.parse(storedValue)).toMatchObject({
      state: {
        mobileSurface: {
          kind: "merged",
          mainWidthPx: 294,
          side: "right",
        },
      },
      version: 2,
    });
  });

  it("defers width writes while preserving the latest local value", () => {
    vi.useFakeTimers();
    renderProbe();

    act(() => {
      setLatestRightDesktopWidthPx(340);
    });

    expect(
      rootElement?.firstElementChild?.getAttribute("data-right-width"),
    ).toBe("340");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(160);
    });

    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    expect(storedValue).not.toBeNull();
    if (storedValue === null) {
      return;
    }

    expect(JSON.parse(storedValue)).toMatchObject({
      state: {
        rightDesktopWidthPx: 340,
      },
      version: 2,
    });
  });

  it("flushes deferred width writes on unmount", () => {
    vi.useFakeTimers();
    renderProbe();

    act(() => {
      setLatestRightDesktopWidthPx(340);
    });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    if (root === null) {
      throw new Error("Expected mounted sidebar state probe");
    }

    const mountedRoot = root;
    act(() => {
      mountedRoot.unmount();
    });
    root = null;

    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    expect(storedValue).not.toBeNull();
    if (storedValue === null) {
      return;
    }

    expect(JSON.parse(storedValue)).toMatchObject({
      state: {
        rightDesktopWidthPx: 340,
      },
      version: 2,
    });
  });
});
