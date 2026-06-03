// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  RouteAddressCombobox,
  type RouteAddressComboboxState,
  type RouteEditorEvent,
} from "./RouteAddressCombobox";
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

  function renderCombobox(
    onDebugStateChange?: (state: RouteAddressComboboxState) => void,
    initialEntries = ["/machines"],
    onDebugEvent?: (event: RouteEditorEvent) => void,
  ) {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    const mountedRoot = createRoot(rootElement);
    root = mountedRoot;

    act(() => {
      mountedRoot.render(
        <TestRouterProvider initialEntries={initialEntries}>
          <RouteAddressCombobox
            onDebugEvent={onDebugEvent}
            onDebugStateChange={onDebugStateChange}
          />
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

  function setInputValue(input: HTMLInputElement, value: string) {
    const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (typeof valueDescriptor?.set !== "function") {
      throw new Error("Expected HTMLInputElement value setter.");
    }

    valueDescriptor.set.call(input, value);
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
      kind: "focused",
      initialPath: "/machines",
      latestPath: "/machines?",
      origin: "http://localhost:3000",
      selection: {
        direction: "forward",
        end: 4,
        start: 2,
      },
    });
  });

  it("does not add an empty search marker on focus for the root route", () => {
    const input = renderCombobox(undefined, ["/"]);

    act(() => {
      input.focus();
    });

    expect(input.value).toBe("http://localhost:3000/");
  });

  it("adds an empty search marker on focus for non-root routes", () => {
    const input = renderCombobox();

    act(() => {
      input.focus();
    });

    expect(input.value).toBe("http://localhost:3000/machines?");
  });

  it("adds an empty next-param marker on focus when search params already exist", () => {
    const input = renderCombobox(undefined, ["/logo?leftFace=secondary"]);

    act(() => {
      input.focus();
    });

    expect(input.value).toBe("http://localhost:3000/logo?leftFace=secondary&");
  });

  it("normalizes the empty search marker away on blur", () => {
    const input = renderCombobox();

    act(() => {
      input.setSelectionRange(input.value.length, input.value.length);
      input.focus();
    });
    act(() => {
      input.blur();
    });

    expect(input.value).toBe("http://localhost:3000/machines");
    expect(readSuggestions()).toBeNull();
  });

  it("moves a plain backspace inside the origin to the route prefix without deleting", () => {
    const input = renderCombobox();

    act(() => {
      input.focus();
    });

    const lockedPrefix = "http://localhost:3000/";
    const backspaceEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Backspace",
    });

    act(() => {
      input.setSelectionRange(5, 5);
      input.dispatchEvent(backspaceEvent);
    });

    expect(backspaceEvent.defaultPrevented).toBe(true);
    expect(input.value).toBe("http://localhost:3000/machines?");
    expect(input.selectionStart).toBe(lockedPrefix.length);
    expect(input.selectionEnd).toBe(lockedPrefix.length);
  });

  it("prevents plain backspace at the route prefix boundary", () => {
    const input = renderCombobox();

    act(() => {
      input.focus();
    });

    const lockedPrefix = "http://localhost:3000/";
    const backspaceEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Backspace",
    });

    act(() => {
      input.setSelectionRange(lockedPrefix.length, lockedPrefix.length);
      input.dispatchEvent(backspaceEvent);
    });

    expect(backspaceEvent.defaultPrevented).toBe(true);
    expect(input.value).toBe("http://localhost:3000/machines?");
    expect(input.selectionStart).toBe(lockedPrefix.length);
    expect(input.selectionEnd).toBe(lockedPrefix.length);
  });

  it("clamps a plain backspace selection that crosses the route prefix", () => {
    const input = renderCombobox();

    act(() => {
      input.focus();
    });

    const lockedPrefix = "http://localhost:3000/";
    const selectionEnd = lockedPrefix.length + 3;
    const backspaceEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Backspace",
    });

    act(() => {
      input.setSelectionRange(5, selectionEnd);
      input.dispatchEvent(backspaceEvent);
    });

    expect(backspaceEvent.defaultPrevented).toBe(false);
    expect(input.selectionStart).toBe(lockedPrefix.length);
    expect(input.selectionEnd).toBe(selectionEnd);
  });

  it("keeps editable plain backspace out of the pre-native state machine path", () => {
    const onDebugEvent = vi.fn();
    const input = renderCombobox(undefined, ["/machines"], onDebugEvent);

    act(() => {
      input.focus();
    });
    onDebugEvent.mockClear();

    const lockedPrefix = "http://localhost:3000/";
    const backspaceEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Backspace",
    });

    act(() => {
      input.setSelectionRange(lockedPrefix.length + 3, lockedPrefix.length + 3);
      input.dispatchEvent(backspaceEvent);
    });

    expect(backspaceEvent.defaultPrevented).toBe(false);
    expect(onDebugEvent.mock.calls.map(([event]) => event.type)).not.toContain(
      "requestedProtectedBackspace",
    );
  });

  it("clamps cmd-backspace to the route prefix before the native edit runs", () => {
    const input = renderCombobox();

    act(() => {
      input.focus();
    });

    const lockedPrefix = "http://localhost:3000/";
    const selectionStart = lockedPrefix.length + 3;
    act(() => {
      input.setSelectionRange(selectionStart, selectionStart);
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Backspace",
          metaKey: true,
        }),
      );
    });

    expect(input.selectionStart).toBe(lockedPrefix.length);
    expect(input.selectionEnd).toBe(selectionStart);
  });

  it("mirrors the native cmd-backspace deletion after the browser edits the input", () => {
    const input = renderCombobox();

    act(() => {
      input.focus();
    });

    const lockedPrefix = "http://localhost:3000/";
    const selectionStart = lockedPrefix.length + 3;
    act(() => {
      input.setSelectionRange(selectionStart, selectionStart);
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Backspace",
          metaKey: true,
        }),
      );
      setInputValue(input, "http://localhost:3000/hines?");
      input.setSelectionRange(lockedPrefix.length, lockedPrefix.length);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(input.value).toBe("http://localhost:3000/hines?");
    expect(input.selectionStart).toBe(lockedPrefix.length);
    expect(input.selectionEnd).toBe(lockedPrefix.length);
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
      origin: "http://localhost:3000",
      path: "/machines",
    });
  });
});
