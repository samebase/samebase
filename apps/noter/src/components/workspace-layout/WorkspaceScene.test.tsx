// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  WorkspaceScene,
  type WorkspaceBottomDockRenderProps,
} from "@/components/workspace-layout/WorkspaceScene";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

function TestDock({ onMobileDockInsetChange }: WorkspaceBottomDockRenderProps) {
  React.useEffect(() => {
    onMobileDockInsetChange("80px");
  }, [onMobileDockInsetChange]);

  return <div data-testid="workspace-scene-dock" />;
}

describe("WorkspaceScene", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
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

  it("clears stale mobile dock inset when the bottom dock is removed", () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    const mountedRoot = root;

    act(() => {
      mountedRoot.render(
        <WorkspaceScene
          workspaceBody={<div data-testid="workspace-scene-body">body</div>}
          bottomDock={props => <TestDock {...props} />}
        />,
      );
    });

    const body = rootElement.querySelector<HTMLElement>(
      '[data-testid="workspace-scene-body"]',
    );
    expect(body).not.toBeNull();
    if (body === null) {
      return;
    }

    const scrollSurface = body.parentElement;
    expect(scrollSurface).not.toBeNull();
    if (scrollSurface === null) {
      return;
    }

    expect(scrollSurface.style.paddingBottom).toBe("80px");
    expect(scrollSurface.style.scrollPaddingBottom).toBe("80px");

    act(() => {
      mountedRoot.render(
        <WorkspaceScene
          workspaceBody={<div data-testid="workspace-scene-body">body</div>}
        />,
      );
    });

    expect(scrollSurface.style.paddingBottom).toBe("");
    expect(scrollSurface.style.scrollPaddingBottom).toBe("");
  });
});
