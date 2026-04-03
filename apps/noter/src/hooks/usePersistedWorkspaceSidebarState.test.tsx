// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";

let mockedQueryState: WorkspaceSidebarState | null | undefined = undefined;
const mockedMutation = vi.fn(async () => null);

vi.mock("convex/react", () => ({
  useMutation: () => mockedMutation,
  useQuery: () => mockedQueryState,
}));

import { usePersistedWorkspaceSidebarState } from "@/hooks/usePersistedWorkspaceSidebarState";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const DEFAULT_SIDEBAR_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: 280,
  leftMobileWidthPx: 280,
  mobilePane: "main",
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
    workspaceKey: "machines",
  });

  return <div data-mobile-pane={sidebarState.mobilePane} />;
}

describe("usePersistedWorkspaceSidebarState", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    mockedQueryState = undefined;
    mockedMutation.mockClear();
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

    expect(
      rootElement.firstElementChild?.getAttribute("data-mobile-pane"),
    ).toBe("left");

    mockedQueryState = null;
    act(() => {
      mountedRoot.render(<SidebarStateProbe />);
    });

    expect(
      rootElement.firstElementChild?.getAttribute("data-mobile-pane"),
    ).toBe("left");
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

    expect(
      rootElement.firstElementChild?.getAttribute("data-mobile-pane"),
    ).toBe("main");
  });
});
