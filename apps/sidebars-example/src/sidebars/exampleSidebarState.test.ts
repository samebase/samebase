// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX } from "@samebase/sidebars/SidebarLayoutGeometry";
import type {
  SidebarLayoutState,
  SidebarLayoutStateController,
} from "@samebase/sidebars/SidebarLayoutState";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useExampleSidebarController } from "./exampleSidebarState";

const { act } = React;
const STORAGE_KEY = "samebase_sidebars_example_state";
const DEFAULT_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: 240,
  leftMobileWidthPx: 240,
  mobilePane: "main",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: true,
  rightDesktopWidthPx: 288,
  rightMobileWidthPx: 288,
} satisfies SidebarLayoutState;
const VALID_STORED_STATE = {
  ...DEFAULT_STATE,
  leftDesktopWidthPx: 320,
  mobilePane: "left",
  mobileSurface: {
    kind: "merged",
    mainWidthPx: SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX,
    side: "left",
  },
} satisfies SidebarLayoutState;
const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");

function createTestStorage() {
  const entries = new Map<string, string>();

  return {
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    get length() {
      return entries.size;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
  } satisfies Storage;
}

let latestController: SidebarLayoutStateController | null = null;

function SidebarStateProbe() {
  const controller = useExampleSidebarController();

  React.useLayoutEffect(() => {
    latestController = controller;
    return () => {
      latestController = null;
    };
  }, [controller]);

  return null;
}

function getController() {
  const controller = latestController;
  if (controller === null) {
    throw new Error("Expected sidebar state controller.");
  }

  return controller;
}

function seedStorage(value: unknown) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function readStoredValue(): unknown {
  const serializedValue = window.localStorage.getItem(STORAGE_KEY);
  if (serializedValue === null) {
    return null;
  }

  return JSON.parse(serializedValue);
}

describe("example sidebar state", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createTestStorage(),
    });
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
  });

  afterEach(() => {
    latestController = null;
    if (root !== null) {
      const mountedRoot = root;
      act(() => mountedRoot.unmount());
    }
    root = null;
    rootElement?.remove();
    rootElement = null;
    window.localStorage.clear();
    if (originalLocalStorageDescriptor !== undefined) {
      Object.defineProperty(window, "localStorage", originalLocalStorageDescriptor);
    }
    vi.useRealTimers();
  });

  function renderProbe() {
    const mountedRoot = root;
    if (mountedRoot === null) {
      throw new Error("Expected mounted probe root.");
    }

    act(() => mountedRoot.render(React.createElement(SidebarStateProbe)));
  }

  it("applies a valid stored state", () => {
    seedStorage({ state: VALID_STORED_STATE, version: 1 });

    renderProbe();

    expect(getController().state).toEqual(VALID_STORED_STATE);
  });

  it.each([
    ["old version", { state: VALID_STORED_STATE, version: 0 }],
    [
      "invalid shape",
      {
        state: { ...VALID_STORED_STATE, leftDesktopWidthPx: "wide" },
        version: 1,
      },
    ],
  ])("uses defaults for an %s", (_label, storedValue) => {
    seedStorage(storedValue);

    renderProbe();

    expect(getController().state).toEqual(DEFAULT_STATE);
  });

  it("uses defaults when a merged main width is below the package minimum", () => {
    seedStorage({
      state: {
        ...VALID_STORED_STATE,
        mobileSurface: {
          kind: "merged",
          mainWidthPx: SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX - 1,
          side: "left",
        },
      },
      version: 1,
    });

    renderProbe();

    expect(getController().state).toEqual(DEFAULT_STATE);
  });

  it("writes immediate updates in the versioned envelope", () => {
    renderProbe();

    act(() => {
      getController().setState((state) => ({ ...state, mobilePane: "left" }), "immediate");
    });

    expect(readStoredValue()).toEqual({
      state: { ...DEFAULT_STATE, mobilePane: "left" },
      version: 1,
    });
  });

  it("waits 160 milliseconds before a deferred width write", () => {
    vi.useFakeTimers();
    renderProbe();

    act(() => {
      getController().setState(
        (state) => ({ ...state, leftDesktopWidthPx: 360 }),
        "width_deferred",
      );
      vi.advanceTimersByTime(159);
    });
    expect(readStoredValue()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(readStoredValue()).toEqual({
      state: { ...DEFAULT_STATE, leftDesktopWidthPx: 360 },
      version: 1,
    });
  });

  it("flushes a deferred width write on unmount", () => {
    vi.useFakeTimers();
    renderProbe();

    act(() => {
      getController().setState(
        (state) => ({ ...state, rightDesktopWidthPx: 360 }),
        "width_deferred",
      );
    });
    expect(readStoredValue()).toBeNull();

    const mountedRoot = root;
    if (mountedRoot === null) {
      throw new Error("Expected mounted probe root.");
    }
    act(() => mountedRoot.unmount());
    root = null;

    expect(readStoredValue()).toEqual({
      state: { ...DEFAULT_STATE, rightDesktopWidthPx: 360 },
      version: 1,
    });
  });
});
