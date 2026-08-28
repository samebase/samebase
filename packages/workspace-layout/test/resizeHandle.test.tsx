// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { WorkspaceLayoutV2ResizeHandle } from "../src/WorkspaceLayoutV2ResizeHandle.tsx";
import { acquireWorkspaceResizeBodyStyleLock } from "../src/workspaceResizeBodyStyleLock.ts";

const { act } = React;
let root: Root | null = null;

afterEach(() => {
  if (root !== null) {
    const mountedRoot = root;
    act(() => mountedRoot.unmount());
  }
  root = null;
  document.body.replaceChildren();
  document.body.removeAttribute("style");
});

describe("workspace resize body style lock", () => {
  it("keeps the lock until every owner releases it, then restores exact inline styles", () => {
    document.body.style.setProperty("cursor", "wait", "important");
    document.body.style.setProperty("user-select", "text", "important");

    const releaseFirst = acquireWorkspaceResizeBodyStyleLock(document.body);
    const releaseSecond = acquireWorkspaceResizeBodyStyleLock(document.body);

    expect(document.body.style.getPropertyValue("cursor")).toBe("col-resize");
    expect(document.body.style.getPropertyValue("user-select")).toBe("none");

    releaseFirst();
    expect(document.body.style.getPropertyValue("cursor")).toBe("col-resize");

    releaseSecond();
    expect(document.body.style.getPropertyValue("cursor")).toBe("wait");
    expect(document.body.style.getPropertyPriority("cursor")).toBe("important");
    expect(document.body.style.getPropertyValue("user-select")).toBe("text");
    expect(document.body.style.getPropertyPriority("user-select")).toBe("important");
  });

  it("does not change body styles when an idle handle mounts", () => {
    document.body.style.setProperty("cursor", "wait", "important");
    document.body.style.setProperty("user-select", "text", "important");
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <WorkspaceLayoutV2ResizeHandle
          ariaLabel="Resize navigation pane"
          currentSizePx={240}
          dataTestId="resize"
          maxSizePx={400}
          minSizePx={160}
          positionPx={240}
          resizeFrom="left"
          onSizeChange={vi.fn()}
        />,
      );
    });

    expect(document.body.style.getPropertyValue("cursor")).toBe("wait");
    expect(document.body.style.getPropertyPriority("cursor")).toBe("important");
    expect(document.body.style.getPropertyValue("user-select")).toBe("text");
    expect(document.body.style.getPropertyPriority("user-select")).toBe("important");
  });

  it("uses a required consumer label and omits optional value text by default", () => {
    const markup = React.createElement(WorkspaceLayoutV2ResizeHandle, {
      ariaLabel: "Resize navigation pane",
      currentSizePx: 240,
      dataTestId: "resize",
      maxSizePx: 400,
      minSizePx: 160,
      onSizeChange: vi.fn(),
      positionPx: 240,
      resizeFrom: "left",
    });
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => root?.render(markup));

    const handle = container.querySelector('[role="separator"]');
    expect(handle?.getAttribute("aria-label")).toBe("Resize navigation pane");
    expect(handle?.hasAttribute("aria-valuetext")).toBe(false);
  });
});
