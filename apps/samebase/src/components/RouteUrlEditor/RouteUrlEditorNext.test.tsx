// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { RouteUrlEditorNext } from "./RouteUrlEditorNext";

const { act } = React;

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

  beforeEach(() => {
    useQueryMock.mockReturnValue(false);
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

  it("renders scoped query suggestion groups without changing option indexes", () => {
    const display = renderEditor(["/logo"]);

    act(() => {
      display.focus();
    });

    const suggestions = [...(rootElement?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const groups = [...(rootElement?.querySelectorAll<HTMLElement>('[role="group"]') ?? [])];

    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
      "Theme",
      "Logo",
      "Logo motion",
      "Logo view",
    ]);
    for (const group of groups) {
      const label = group.querySelector<HTMLElement>('[aria-hidden="true"]');
      expect(label?.classList.contains("font-bold")).toBe(true);
      expect(label?.hasAttribute("data-route-url-editor-suggestion-index")).toBe(false);
    }
    expect(
      suggestions.map((suggestion) =>
        suggestion.getAttribute("data-route-url-editor-suggestion-index"),
      ),
    ).toEqual(suggestions.map((_, suggestionIndex) => `${suggestionIndex}`));
    expect(
      [...(groups[1]?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])].map((option) =>
        option.textContent.trim(),
      ),
    ).toContain("?top=sky-500");
  });

  it("shows only the Theme group outside logo routes", () => {
    const display = renderEditor(["/terms"]);

    act(() => {
      display.focus();
    });

    expect(
      [...(rootElement?.querySelectorAll<HTMLElement>('[role="group"]') ?? [])].map((group) =>
        group.getAttribute("aria-label"),
      ),
    ).toEqual(["Theme"]);
    expect(readSuggestionValues()).not.toEqual(
      expect.arrayContaining(["?top=sky-500", "?auto-rotate", "?rot=46"]),
    );
  });

  it("uses a blue pill and subtle blue row tint for developer logo routes in dev mode", () => {
    useQueryMock.mockReturnValue({
      accessKeys: ["access_public", "access_dashboard"],
    });
    const display = renderEditor(["/?dev"]);

    act(() => {
      display.focus();
    });

    const input = readRequiredInput();
    const pathCursorPosition = input.value.lastIndexOf("/") + 1;
    act(() => {
      input.setSelectionRange(pathCursorPosition, pathCursorPosition);
      input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const values = [
      ...(rootElement?.querySelectorAll<HTMLElement>(
        '[data-testid="route-url-editor-suggestion-value"]',
      ) ?? []),
    ];
    const developerValue = values.find((element) => element.textContent.trim() === "/logo/iso");
    const developerRow = developerValue?.closest<HTMLElement>(
      '[data-testid="route-url-editor-suggestion"]',
    );
    const developerBadge = developerRow?.querySelector<HTMLElement>('[data-slot="badge"]');
    const standardValue = values.find((element) => element.textContent.trim() === "/logo");
    const standardRow = standardValue?.closest<HTMLElement>(
      '[data-testid="route-url-editor-suggestion"]',
    );

    expect(developerValue?.textContent.trim()).toBe("/logo/iso");
    expect(developerRow?.classList.contains("bg-sky-500/5")).toBe(true);
    expect(developerBadge?.textContent.trim()).toBe("dev");
    expect(developerBadge?.getAttribute("aria-hidden")).toBe("true");
    expect(developerBadge?.classList.contains("bg-sky-500/10")).toBe(true);
    expect(standardRow?.classList.contains("bg-sky-500/5")).toBe(false);
    expect(standardRow?.querySelector('[data-slot="badge"]')).toBeNull();
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

  it("updates page-owned hashes when matching document nodes are inserted", async () => {
    const display = renderEditor(["/#intro"]);

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      display.focus();
    });

    const input = readRequiredInput();
    const hashCursorPosition = input.value.indexOf("#") + "#i".length;

    act(() => {
      input.setSelectionRange(hashCursorPosition, hashCursorPosition);
      input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(readSuggestionValues()).not.toContain("#pricing");

    const pageHashElement = document.createElement("section");
    pageHashElement.dataset.landingHeadingId = "pricing";

    await act(async () => {
      document.body.append(pageHashElement);
      await Promise.resolve();
    });

    expect(readSuggestionValues()).toContain("#pricing");
  });
});
