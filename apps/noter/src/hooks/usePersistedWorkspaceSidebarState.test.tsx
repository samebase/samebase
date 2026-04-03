// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersistedSidebarProvider } from "@/components/PersistedSidebarProvider";
import type {
  WorkspaceSidebarState,
  WorkspaceSidebarStateKey,
} from "../../convex/workspaceSidebarStateModel";

let mockedQueryState: WorkspaceSidebarState | null | undefined = undefined;
const mockedMutation = vi.fn(async () => null);
let latestSetMobilePane: React.Dispatch<
  React.SetStateAction<WorkspaceSidebarState["mobilePane"]>
> | null = null;

vi.mock("convex/react", () => ({
  useMutation: () => mockedMutation,
  useQuery: () => mockedQueryState,
}));

import { usePersistedWorkspaceSidebarState } from "@/hooks/usePersistedWorkspaceSidebarState";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
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
  latestSetMobilePane = sidebarState.setMobilePane;

  return (
    <div
      data-hydrated={sidebarState.isHydrated ? "1" : "0"}
      data-mobile-pane={sidebarState.mobilePane}
    />
  );
}

function PersistedSidebarProviderProbe({
  workspaceKey = "machines",
}: {
  workspaceKey?: WorkspaceSidebarStateKey;
}) {
  return (
    <PersistedSidebarProvider
      className="h-full min-h-0"
      defaultState={DEFAULT_SIDEBAR_STATE}
      workspaceKey={workspaceKey}
    >
      <div data-testid="provider-child" />
    </PersistedSidebarProvider>
  );
}

describe("usePersistedWorkspaceSidebarState", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    mockedQueryState = undefined;
    mockedMutation.mockClear();
    mockedMutation.mockImplementation(async () => null);
    latestSetMobilePane = null;
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
      latestSetMobilePane?.("left");
    });

    expect(mockedMutation).not.toHaveBeenCalled();
    expect(rootElement.firstElementChild?.getAttribute("data-hydrated")).toBe(
      "0",
    );
    expect(
      rootElement.firstElementChild?.getAttribute("data-mobile-pane"),
    ).toBe("left");
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
      latestSetMobilePane?.("left");
    });
    act(() => {
      latestSetMobilePane?.("right");
    });

    await act(async () => {
      rejecters[0]?.(new Error("stale persist failed"));
      await Promise.resolve();
    });

    expect(
      rootElement.firstElementChild?.getAttribute("data-mobile-pane"),
    ).toBe("right");
  });

  it("keeps the provider unmounted until the persisted query hydrates", () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    mockedQueryState = undefined;
    act(() => {
      mountedRoot.render(<PersistedSidebarProviderProbe />);
    });

    expect(
      rootElement.querySelector('[data-testid="provider-child"]'),
    ).toBeNull();

    mockedQueryState = null;
    act(() => {
      mountedRoot.render(<PersistedSidebarProviderProbe />);
    });

    expect(
      rootElement.querySelector('[data-testid="provider-child"]'),
    ).not.toBeNull();
  });
});
