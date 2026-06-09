// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { RouteUrlEditorNext } from "./RouteUrlEditorNext";

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

describe("RouteUrlEditorNext", () => {
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
    for (const element of document.body.querySelectorAll("[data-landing-heading-id]")) {
      element.remove();
    }
    useQueryMock.mockReset();
    window.history.replaceState(null, "", "/");
  });

  function renderEditor(initialEntries: string[] = ["/"]): HTMLInputElement {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    const mountedRoot = createRoot(rootElement);
    root = mountedRoot;

    act(() => {
      mountedRoot.render(
        <TestRouterProvider initialEntries={initialEntries}>
          <RouteUrlEditorNext />
        </TestRouterProvider>,
      );
    });

    return readRequiredDisplay();
  }

  function readRequiredDisplay(): HTMLInputElement {
    const display = rootElement?.querySelector<HTMLInputElement>(
      '[data-testid="route-url-editor-display"]',
    );
    if (!display) {
      throw new Error("Expected route URL editor display.");
    }

    return display;
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

  function readSuggestionValues(): string[] {
    if (rootElement === null) {
      throw new Error("Expected route URL editor root.");
    }

    return [
      ...rootElement.querySelectorAll<HTMLElement>('[data-testid="route-url-editor-suggestion"]'),
    ].map((element) => element.textContent.trim());
  }

  it("displays the current route hash", () => {
    const display = renderEditor(["/?prod-ui#top"]);

    expect(display.value.endsWith("/?prod-ui#top")).toBe(true);

    act(() => {
      display.focus();
    });

    const input = readRequiredInput();
    expect(input.value.endsWith("/?prod-ui&#top")).toBe(true);
  });

  it("does not invent an empty hash marker", () => {
    const display = renderEditor(["/logo"]);

    expect(display.value).toBe("/logo");
  });

  it("suggests page-owned hashes from the current document", async () => {
    const pageHashElement = document.createElement("section");
    pageHashElement.dataset.landingHeadingId = "pricing";
    document.body.append(pageHashElement);

    const display = renderEditor(["/#top"]);

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      display.focus();
    });

    const input = readRequiredInput();
    const hashCursorPosition = input.value.indexOf("#") + "#t".length;

    act(() => {
      input.setSelectionRange(hashCursorPosition, hashCursorPosition);
      input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(readSuggestionValues()).toContain("#pricing");
  });
});
