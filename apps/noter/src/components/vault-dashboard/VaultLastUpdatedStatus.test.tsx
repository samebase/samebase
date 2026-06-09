// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { VaultLastUpdatedStatus } from "@/components/vault-dashboard/VaultLastUpdatedStatus";

const { act } = React;
describe("VaultLastUpdatedStatus", () => {
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
    window.getSelection()?.removeAllRanges();
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
    window.getSelection()?.removeAllRanges();
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
    const onRefresh = vi.fn();
    const button = renderStatus({ onRefresh });
    const selection = window.getSelection();
    expect(selection).not.toBeNull();
    if (selection === null) {
      throw new Error("Expected DOM selection support");
    }

    const range = document.createRange();
    range.selectNodeContents(button);
    selection.removeAllRanges();
    selection.addRange(range);

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
