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
  rightDesktopOpen: true,
  rightDesktopWidthPx: 288,
  rightMobileWidthPx: 288,
} satisfies WorkspaceSidebarState;

const STORED_SIDEBAR_STATE = {
  ...DEFAULT_SIDEBAR_STATE,
  mobilePane: "right",
  rightDesktopWidthPx: 360,
} satisfies WorkspaceSidebarState;

let latestSetMobilePane: React.Dispatch<
  React.SetStateAction<WorkspaceSidebarState["mobilePane"]>
> | null = null;
let latestSetRightDesktopWidthPx: React.Dispatch<
  React.SetStateAction<number>
> | null = null;

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
  latestSetMobilePane = sidebarState.setMobilePane;
  latestSetRightDesktopWidthPx = sidebarState.setRightDesktopWidthPx;

  return (
    <div
      data-mobile-pane={sidebarState.mobilePane}
      data-preference-source={sidebarState.preferenceSource}
      data-right-width={`${sidebarState.rightDesktopWidthPx}`}
    />
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
    latestSetMobilePane = null;
    latestSetRightDesktopWidthPx = null;
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
        version: 1,
      }),
    );

    renderProbe();

    expect(
      rootElement?.firstElementChild?.getAttribute("data-mobile-pane"),
    ).toBe("right");
    expect(
      rootElement?.firstElementChild?.getAttribute("data-right-width"),
    ).toBe("360");
    expect(
      rootElement?.firstElementChild?.getAttribute("data-preference-source"),
    ).toBe("local");
  });

  it("falls back to defaults for malformed localStorage payloads", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          ...STORED_SIDEBAR_STATE,
          rightDesktopWidthPx: "wide",
        },
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
    expect(
      rootElement?.firstElementChild?.getAttribute("data-preference-source"),
    ).toBe("default");
  });

  it("clears localStorage and reports reset when the reset flag is active", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: STORED_SIDEBAR_STATE,
        version: 1,
      }),
    );

    renderProbe({ reset: true });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(
      rootElement?.firstElementChild?.getAttribute("data-mobile-pane"),
    ).toBe("main");
    expect(
      rootElement?.firstElementChild?.getAttribute("data-preference-source"),
    ).toBe("reset");
  });

  it("persists immediate pane changes to localStorage", () => {
    renderProbe();

    act(() => {
      latestSetMobilePane?.("left");
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
      version: 1,
    });
    expect(
      rootElement?.firstElementChild?.getAttribute("data-preference-source"),
    ).toBe("local");
  });

  it("defers width writes while preserving the latest local value", () => {
    vi.useFakeTimers();
    renderProbe();

    act(() => {
      latestSetRightDesktopWidthPx?.(340);
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
      version: 1,
    });
  });
});
