// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { SidebarLayoutStateController } from "@samebase/sidebars/SidebarLayoutState";
import type { WorkspaceSidebarState } from "../../convex/userPreferenceModel";

let mockedQueryState: WorkspaceSidebarState | null | undefined = undefined;
const mockedMutation = vi.fn(async () => null);
let latestSidebarStateController: SidebarLayoutStateController | null = null;

vi.mock("convex/react", () => ({
  useMutation: () => mockedMutation,
  useQuery: () => mockedQueryState,
}));

import { usePersistedWorkspaceSidebarState } from "@/appShell/usePersistedWorkspaceSidebarState";

const { act } = React;
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  })),
});

const DEFAULT_SIDEBAR_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: 280,
  leftMobileWidthPx: 280,
  mobilePane: "main",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: false,
  rightDesktopWidthPx: 320,
  rightMobileWidthPx: 320,
} satisfies WorkspaceSidebarState;

const OPEN_LEFT_SIDEBAR_STATE = {
  ...DEFAULT_SIDEBAR_STATE,
  mobilePane: "left",
} satisfies WorkspaceSidebarState;

function SidebarStateProbe() {
  const sidebarState = usePersistedWorkspaceSidebarState({
    defaults: DEFAULT_SIDEBAR_STATE,
    onPersistedStateApplied: null,
    workspaceKey: "app",
  });
  React.useEffect(() => {
    latestSidebarStateController = sidebarState;
  }, [sidebarState]);

  return (
    <div
      data-hydrated={sidebarState.isHydrated ? "1" : "0"}
      data-mobile-pane={sidebarState.state.mobilePane}
    />
  );
}

function setLatestMobilePane(nextPane: React.SetStateAction<WorkspaceSidebarState["mobilePane"]>) {
  const controller = latestSidebarStateController;
  if (controller === null) {
    throw new Error("Expected sidebar state controller");
  }

  controller.setState(
    (state) => ({
      ...state,
      mobilePane: nextPane instanceof Function ? nextPane(state.mobilePane) : nextPane,
    }),
    "immediate",
  );
}

function setLatestMobileSurface(nextSurface: WorkspaceSidebarState["mobileSurface"]) {
  const controller = latestSidebarStateController;
  if (controller === null) {
    throw new Error("Expected sidebar state controller");
  }

  controller.setState(
    (state) => ({
      ...state,
      mobileSurface: nextSurface,
    }),
    "immediate",
  );
}

describe("usePersistedWorkspaceSidebarState", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    mockedQueryState = undefined;
    mockedMutation.mockClear();
    mockedMutation.mockImplementation(async () => null);
    latestSidebarStateController = null;
    if (root !== null) {
      const mountedRoot = root;
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }
    rootElement?.remove();
    rootElement = null;
  });

  it("keeps the current pane when a persisted row disappears after hydration", () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    mockedQueryState = undefined;
    act(() => {
      mountedRoot.render(<SidebarStateProbe />);
    });

    mockedQueryState = OPEN_LEFT_SIDEBAR_STATE;
    act(() => {
      mountedRoot.render(<SidebarStateProbe />);
    });

    expect(rootElement.firstElementChild?.getAttribute("data-mobile-pane")).toBe("left");

    mockedQueryState = null;
    act(() => {
      mountedRoot.render(<SidebarStateProbe />);
    });

    expect(rootElement.firstElementChild?.getAttribute("data-mobile-pane")).toBe("left");
  });

  it("still falls back to defaults on the first null load", () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    mockedQueryState = null;
    act(() => {
      mountedRoot.render(<SidebarStateProbe />);
    });

    expect(rootElement.firstElementChild?.getAttribute("data-mobile-pane")).toBe("main");
  });

  it("does not persist updates before the first query result hydrates", () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    mockedQueryState = undefined;
    act(() => {
      mountedRoot.render(<SidebarStateProbe />);
    });

    act(() => {
      setLatestMobilePane("left");
    });

    expect(mockedMutation).not.toHaveBeenCalled();
    expect(rootElement.firstElementChild?.getAttribute("data-hydrated")).toBe("0");
    expect(rootElement.firstElementChild?.getAttribute("data-mobile-pane")).toBe("left");
  });

  it("ignores failures from superseded persists", async () => {
    const rejecters: Array<(error: unknown) => void> = [];
    mockedMutation.mockImplementation(
      () =>
        new Promise<null>((_, reject) => {
          rejecters.push(reject);
        }),
    );

    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    mockedQueryState = null;
    act(() => {
      mountedRoot.render(<SidebarStateProbe />);
    });

    act(() => {
      setLatestMobilePane("left");
    });
    act(() => {
      setLatestMobilePane("right");
    });

    await act(async () => {
      rejecters[0]?.(new Error("stale persist failed"));
      await Promise.resolve();
    });

    expect(rootElement.firstElementChild?.getAttribute("data-mobile-pane")).toBe("right");
  });

  it("persists mobile surface changes even when pane and widths stay unchanged", () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    mockedQueryState = null;
    act(() => {
      mountedRoot.render(<SidebarStateProbe />);
    });

    act(() => {
      setLatestMobileSurface({
        kind: "merged",
        mainWidthPx: 294,
        side: "right",
      });
    });

    expect(mockedMutation).toHaveBeenCalledWith({
      state: {
        ...DEFAULT_SIDEBAR_STATE,
        mobileSurface: {
          kind: "merged",
          mainWidthPx: 294,
          side: "right",
        },
      },
      workspaceKey: "app",
    });
  });
});
