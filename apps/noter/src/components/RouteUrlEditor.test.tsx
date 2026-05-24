// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { RouteUrlEditor } from "./RouteUrlEditor";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useQuery: useQueryMock,
  };
});

describe("RouteUrlEditor", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;

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
    useQueryMock.mockReset();
  });

  function renderEditor(initialEntries: string[] = ["/"]): HTMLInputElement {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    const mountedRoot = createRoot(rootElement);
    root = mountedRoot;

    act(() => {
      mountedRoot.render(
        <TestRouterProvider initialEntries={initialEntries}>
          <RouteUrlEditor />
        </TestRouterProvider>,
      );
    });

    return readRequiredInput();
  }

  function readRequiredInput(): HTMLInputElement {
    const input = rootElement?.querySelector<HTMLInputElement>(
      '[data-testid="route-url-editor-input"]',
    );
    if (!input) {
      throw new Error("Expected route URL editor input.");
    }

    return input;
  }

  function readSuggestions(): HTMLElement | null {
    return (
      rootElement?.querySelector<HTMLElement>('[data-testid="route-url-editor-suggestions"]') ??
      null
    );
  }

  it("keeps only route history controls beside the input", () => {
    renderEditor();

    expect(rootElement?.querySelector('button[aria-label="Back"]')).not.toBeNull();
    expect(rootElement?.querySelector('button[aria-label="Forward"]')).not.toBeNull();
    expect(rootElement?.querySelector('button[aria-label="Refresh"]')).toBeNull();
    expect(rootElement?.querySelector('button[aria-label="Go to route URL"]')).toBeNull();
    expect(rootElement?.querySelectorAll("button")).toHaveLength(2);
  });

  it("blurs the focused input when the page scrolls underneath", () => {
    const input = renderEditor();

    act(() => {
      input.focus();
    });

    expect(document.activeElement).toBe(input);
    expect(readSuggestions()).not.toBeNull();

    act(() => {
      window.dispatchEvent(new WheelEvent("wheel"));
    });

    expect(document.activeElement).not.toBe(input);
    expect(readSuggestions()).toBeNull();
  });

  it("keeps focus when the suggestions list scrolls", () => {
    const input = renderEditor();

    act(() => {
      input.focus();
    });

    const suggestions = readSuggestions();
    if (!suggestions) {
      throw new Error("Expected route URL editor suggestions.");
    }

    act(() => {
      suggestions.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    });

    expect(document.activeElement).toBe(input);
    expect(readSuggestions()).not.toBeNull();
  });
});
