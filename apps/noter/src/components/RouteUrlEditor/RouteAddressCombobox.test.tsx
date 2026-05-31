// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { RouteAddressCombobox, type RouteAddressComboboxState } from "./RouteAddressCombobox";
import { TestRouterProvider } from "@/test/TestRouterProvider";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const scrollIntoViewMock = vi.fn();

describe("RouteAddressCombobox", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock,
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        disconnect() {}
        observe() {}
        unobserve() {}
      },
    );
  });

  afterEach(() => {
    if (root) {
      const mountedRoot = root;
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }

    rootElement?.remove();
    rootElement = null;
    scrollIntoViewMock.mockReset();
    vi.unstubAllGlobals();
  });

  function renderCombobox(onDebugStateChange?: (state: RouteAddressComboboxState) => void) {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    const mountedRoot = createRoot(rootElement);
    root = mountedRoot;

    act(() => {
      mountedRoot.render(
        <TestRouterProvider initialEntries={["/machines"]}>
          <RouteAddressCombobox onDebugStateChange={onDebugStateChange} />
        </TestRouterProvider>,
      );
    });

    return readRequiredInput();
  }

  function readRequiredInput(): HTMLInputElement {
    const input = rootElement?.querySelector<HTMLInputElement>(
      '[data-testid="route-address-combobox-input"]',
    );
    if (!input) {
      throw new Error("Expected route address combobox input.");
    }

    return input;
  }

  function readSuggestions(): HTMLElement | null {
    return (
      rootElement?.querySelector<HTMLElement>(
        '[data-testid="route-address-combobox-suggestions"]',
      ) ?? null
    );
  }

  it("shows only the input while blurred", () => {
    renderCombobox();

    expect(readSuggestions()).toBeNull();
  });

  it("opens the dropdown on focus and reports the focused state", () => {
    const onDebugStateChange = vi.fn();
    const input = renderCombobox(onDebugStateChange);

    act(() => {
      input.setSelectionRange(2, 4, "forward");
      input.focus();
    });

    expect(readSuggestions()).not.toBeNull();
    expect(onDebugStateChange).toHaveBeenCalledWith({
      initialPath: "/machines",
      kind: "focused",
      latestPath: "/machines",
      selection: {
        direction: "forward",
        end: 4,
        start: 2,
      },
    });
  });

  it("closes the dropdown on escape and reports the blurred state", () => {
    const onDebugStateChange = vi.fn();
    const input = renderCombobox(onDebugStateChange);

    act(() => {
      input.focus();
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });

    expect(readSuggestions()).toBeNull();
    expect(onDebugStateChange).toHaveBeenLastCalledWith({
      kind: "blurred",
      path: "/machines",
    });
  });
});
