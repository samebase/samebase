// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VaultLastUpdatedStatus } from "@/components/VaultLastUpdatedStatus";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

describe("VaultLastUpdatedStatus", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;
  const originalGetSelection = window.getSelection;

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
    window.getSelection = originalGetSelection;
  });

  function renderStatus(args: { onRefresh?: () => void } = {}) {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    act(() => {
      root?.render(
        <VaultLastUpdatedStatus
          lastSyncedAt={1_000}
          now={4_000}
          onRefresh={args.onRefresh ?? vi.fn()}
          repositoryFullName="octo/repo"
        />,
      );
    });

    const button = rootElement.querySelector("button");
    expect(button).not.toBeNull();
    if (button === null) {
      throw new Error("Expected refresh status button");
    }

    return button;
  }

  it("calls the refresh handler when clicked without active selection", () => {
    window.getSelection = vi.fn(
      () => ({ isCollapsed: true }) as Selection,
    ) as typeof window.getSelection;
    const onRefresh = vi.fn();
    const button = renderStatus({ onRefresh });

    act(() => {
      button.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not call the refresh handler when text is actively selected", () => {
    window.getSelection = vi.fn(
      () => ({ isCollapsed: false }) as Selection,
    ) as typeof window.getSelection;
    const onRefresh = vi.fn();
    const button = renderStatus({ onRefresh });

    act(() => {
      button.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
