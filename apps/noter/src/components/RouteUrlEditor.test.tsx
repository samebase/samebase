// @vitest-environment jsdom

import * as React from "react";
import { useLocation } from "@tanstack/react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_LOGO_PRESET_ID, getLogoPreset } from "@/components/logo/logoPresets";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { RouteUrlEditor } from "./RouteUrlEditor";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
}));
const scrollIntoViewMock = vi.fn();
const DEFAULT_LOGO_VOXEL_STATE_SUGGESTION = getLogoPreset(DEFAULT_LOGO_PRESET_ID).voxelState;
const routeUrlEditorHistoryIndexesStateKey = "__noter_route_url_editor_history_indexes";

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useQuery: useQueryMock,
  };
});

function RouteUrlEditorLocationProbe() {
  const location = useLocation();
  return <output data-testid="route-url-editor-test-href">{location.href}</output>;
}

describe("RouteUrlEditor", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock,
    });
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
    useQueryMock.mockReset();
    window.history.replaceState(null, "", "/");
  });

  function renderEditor(initialEntries: string[] = ["/"], initialIndex?: number): HTMLInputElement {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    const mountedRoot = createRoot(rootElement);
    root = mountedRoot;

    act(() => {
      mountedRoot.render(
        <TestRouterProvider initialEntries={initialEntries} initialIndex={initialIndex}>
          <RouteUrlEditor />
          <RouteUrlEditorLocationProbe />
        </TestRouterProvider>,
      );
    });

    return readRequiredDisplay();
  }

  function startEditing(initialEntries: string[] = ["/"]): HTMLInputElement {
    const display = renderEditor(initialEntries);
    act(() => {
      display.focus();
    });

    return readRequiredInput();
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

  function readRequiredHistoryButton(label: "Back" | "Forward" | "Refresh"): HTMLButtonElement {
    const button = rootElement?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    if (!button) {
      throw new Error(`Expected route URL editor ${label} button.`);
    }

    return button;
  }

  function readSuggestions(): HTMLElement | null {
    return (
      rootElement?.querySelector<HTMLElement>('[data-testid="route-url-editor-suggestions"]') ??
      null
    );
  }

  function readRouteHref(): string {
    const routeHref = rootElement?.querySelector<HTMLOutputElement>(
      '[data-testid="route-url-editor-test-href"]',
    );
    if (!routeHref?.textContent) {
      throw new Error("Expected route URL editor route href probe.");
    }

    return routeHref.textContent;
  }

  function readSuggestionSampleValue(option: HTMLButtonElement): HTMLSpanElement {
    const sampleValue = option.querySelector<HTMLSpanElement>("span span");
    if (!sampleValue) {
      throw new Error("Expected suggestion sample value span.");
    }

    return sampleValue;
  }

  async function pressRouteUrlEditorKey(input: HTMLInputElement, key: string): Promise<void> {
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
      await Promise.resolve();
    });
  }

  async function fillRouteUrlEditorInput(input: HTMLInputElement, value: string): Promise<void> {
    await act(async () => {
      const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      if (typeof valueDescriptor?.set === "function") {
        valueDescriptor.set.call(input, value);
      } else {
        input.value = value;
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: value.at(-1) ?? "" }));
      await Promise.resolve();
    });
  }

  it("keeps browser navigation controls beside the URL surface", () => {
    const display = renderEditor();

    expect(rootElement?.querySelector('button[aria-label="Back"]')).not.toBeNull();
    expect(rootElement?.querySelector('button[aria-label="Forward"]')).not.toBeNull();
    expect(rootElement?.querySelector('button[aria-label="Refresh"]')).not.toBeNull();
    expect(rootElement?.querySelector('button[aria-label="Go to route URL"]')).toBeNull();
    expect(
      rootElement?.querySelectorAll(
        'button[aria-label="Back"], button[aria-label="Forward"], button[aria-label="Refresh"]',
      ),
    ).toHaveLength(3);
    expect(display.value).toBe(`${window.location.origin}/`);
  });

  it("enables browser navigation controls from the current history entry", () => {
    window.history.replaceState(
      {
        __TSR_index: 0,
        [routeUrlEditorHistoryIndexesStateKey]: {
          currentRouteHistoryIndex: 1,
          forwardRouteHistoryIndex: 2,
        },
      },
      "",
      "/logo",
    );

    renderEditor(["/logo"], 0);

    expect(readRequiredHistoryButton("Back").disabled).toBe(false);
    expect(readRequiredHistoryButton("Forward").disabled).toBe(false);
  });

  it("keeps browser navigation controls disabled without app history", () => {
    renderEditor(["/logo"], 0);

    expect(readRequiredHistoryButton("Back").disabled).toBe(true);
    expect(readRequiredHistoryButton("Forward").disabled).toBe(true);
  });

  it("uses one stable absolute URL input across display and edit states", () => {
    const display = renderEditor(["/?prod-ui#top"]);
    const origin = window.location.origin;

    expect(display.value).toBe(`${origin}/?prod-ui#top`);
    expect(rootElement?.querySelector('[data-testid="route-url-editor-input"]')).toBeNull();

    act(() => {
      display.focus();
    });

    const input = readRequiredInput();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe(`${origin}/?prod-ui#top`);
  });

  it("blurs the focused input when the page scrolls underneath", () => {
    const input = startEditing();

    expect(document.activeElement).toBe(input);
    expect(readSuggestions()).not.toBeNull();

    act(() => {
      window.dispatchEvent(new WheelEvent("wheel"));
    });

    expect(document.activeElement).not.toBe(input);
    expect(readSuggestions()).toBeNull();
  });

  it("keeps focus when the suggestions list scrolls", () => {
    const input = startEditing();

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

  it("arrow-previews visible routes without blurring the stable input", async () => {
    useQueryMock.mockReturnValue(true);
    const input = startEditing();
    const origin = window.location.origin;

    for (let step = 0; step < 20 && input.value !== `${origin}/home`; step += 1) {
      await pressRouteUrlEditorKey(input, "ArrowDown");
    }

    expect(input.value).toBe(`${origin}/home`);
    expect(readRouteHref()).toBe("/home");
    expect(document.activeElement).toBe(input);
  });

  it("hover-previews visible routes without blurring the stable input", async () => {
    useQueryMock.mockReturnValue(true);
    const input = startEditing();
    const origin = window.location.origin;
    const homeOption = rootElement?.querySelector<HTMLButtonElement>(
      'button[aria-label="Use /home"]',
    );
    if (!homeOption) {
      throw new Error("Expected /home route URL editor suggestion.");
    }

    await act(async () => {
      homeOption.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await Promise.resolve();
    });

    expect(homeOption.getAttribute("aria-selected")).toBe("true");
    expect(input.value).toBe(`${origin}/home`);
    expect(readRouteHref()).toBe("/home");
    expect(document.activeElement).toBe(input);
  });

  it("opens search params after selecting a path with route options", async () => {
    const input = startEditing();
    const origin = window.location.origin;
    const logoOption = rootElement?.querySelector<HTMLButtonElement>(
      'button[aria-label="Use /logo"]',
    );
    if (!logoOption) {
      throw new Error("Expected /logo route URL editor suggestion.");
    }

    await act(async () => {
      logoOption.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(input.value).toBe(`${origin}/logo?`);
    expect(readRouteHref()).toBe("/logo");
    expect(readSuggestions()?.getAttribute("data-suggestion-kind")).toBe("search");
    expect(
      rootElement?.querySelector('button[aria-label="Use ?leftFace=secondary"]'),
    ).not.toBeNull();
    const leftFaceOption = rootElement?.querySelector<HTMLButtonElement>(
      'button[aria-label="Use ?leftFace=secondary"]',
    );
    if (!leftFaceOption) {
      throw new Error("Expected leftFace search param suggestion.");
    }
    const sampleValue = readSuggestionSampleValue(leftFaceOption);
    expect(sampleValue.textContent).toBe("secondary");
    expect(sampleValue.className).toContain("text-muted-foreground");
    expect(document.activeElement).toBe(input);
  });

  it("opens a search param slot when clicking the end of a route with options", async () => {
    const input = startEditing(["/logo"]);
    const origin = window.location.origin;

    await act(async () => {
      input.setSelectionRange(input.value.length, input.value.length);
      input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(input.value).toBe(`${origin}/logo?`);
    expect(readRouteHref()).toBe("/logo");
    expect(readSuggestions()?.getAttribute("data-suggestion-kind")).toBe("search");
    expect(
      rootElement?.querySelector('button[aria-label="Use ?leftFace=secondary"]'),
    ).not.toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("keeps path suggestions when clicking the end of the root route", async () => {
    const input = startEditing();
    const origin = window.location.origin;

    await act(async () => {
      input.setSelectionRange(input.value.length, input.value.length);
      input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(input.value).toBe(`${origin}/`);
    expect(readRouteHref()).toBe("/");
    expect(readSuggestions()?.getAttribute("data-suggestion-kind")).toBe("path");
    expect(rootElement?.querySelector('button[aria-label="Use /logo"]')).not.toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("opens another search param slot when clicking the end of a complete query", async () => {
    const input = startEditing(["/logo?leftFace=secondary"]);
    const origin = window.location.origin;

    await act(async () => {
      input.setSelectionRange(input.value.length, input.value.length);
      input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(input.value).toBe(`${origin}/logo?leftFace=secondary&`);
    expect(readRouteHref()).toBe("/logo?leftFace=secondary");
    expect(readSuggestions()?.getAttribute("data-suggestion-kind")).toBe("search");
    const searchSuggestionLabels = [
      ...(rootElement?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? []),
    ].map((button) => button.getAttribute("aria-label") ?? "");
    expect(searchSuggestionLabels.some((label) => label.startsWith("Use &"))).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it("ignores stationary hover on search suggestions after keyboard edits", async () => {
    const input = startEditing(["/logo"]);
    const origin = window.location.origin;

    await fillRouteUrlEditorInput(input, `${origin}/logo?vo`);
    const voxOption = rootElement?.querySelector<HTMLButtonElement>(
      `button[aria-label="Use ?vox=${DEFAULT_LOGO_VOXEL_STATE_SUGGESTION}"]`,
    );
    if (!voxOption) {
      throw new Error("Expected vox search param suggestion.");
    }

    await act(async () => {
      voxOption.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await Promise.resolve();
    });

    expect(input.value).toBe(`${origin}/logo?vo`);
    expect(readRouteHref()).toBe("/logo");
    expect(voxOption.getAttribute("aria-selected")).toBe("false");

    await act(async () => {
      voxOption.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(input.value).toBe(`${origin}/logo?vox=`);
    expect(readRouteHref()).toBe("/logo");
  });

  it("previews keyboard-created search suggestions after pointer movement", async () => {
    const input = startEditing(["/logo"]);
    const origin = window.location.origin;

    await fillRouteUrlEditorInput(input, `${origin}/logo?vo`);
    const voxOption = rootElement?.querySelector<HTMLButtonElement>(
      `button[aria-label="Use ?vox=${DEFAULT_LOGO_VOXEL_STATE_SUGGESTION}"]`,
    );
    if (!voxOption) {
      throw new Error("Expected vox search param suggestion.");
    }

    await act(async () => {
      voxOption.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      await Promise.resolve();
    });

    expect(voxOption.getAttribute("aria-selected")).toBe("true");
    expect(readSuggestionSampleValue(voxOption).className).toContain("text-accent-foreground/60");
    expect(input.value).toBe(`${origin}/logo?vox=${DEFAULT_LOGO_VOXEL_STATE_SUGGESTION}`);
    expect(readRouteHref()).toBe(`/logo?vox=${DEFAULT_LOGO_VOXEL_STATE_SUGGESTION}`);
  });

  it("opens value suggestions after selecting a valued search param sample", async () => {
    const input = startEditing(["/logo"]);
    const origin = window.location.origin;

    await fillRouteUrlEditorInput(input, `${origin}/logo?left`);
    const leftFaceOption = rootElement?.querySelector<HTMLButtonElement>(
      'button[aria-label="Use ?leftFace=secondary"]',
    );
    if (!leftFaceOption) {
      throw new Error("Expected leftFace search param suggestion.");
    }

    await act(async () => {
      leftFaceOption.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(input.value).toBe(`${origin}/logo?leftFace=`);
    expect(readRouteHref()).toBe("/logo");
    expect(readSuggestions()?.getAttribute("data-suggestion-kind")).toBe("search-value");
    expect(rootElement?.querySelector('button[aria-label="Use secondary"]')).not.toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("keeps mouse-selected follow-up search params in the query", async () => {
    const input = startEditing();
    const origin = window.location.origin;
    const logoOption = rootElement?.querySelector<HTMLButtonElement>(
      'button[aria-label="Use /logo"]',
    );
    if (!logoOption) {
      throw new Error("Expected /logo route URL editor suggestion.");
    }

    await act(async () => {
      logoOption.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const borderOption = [
      ...(rootElement?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? []),
    ].find((button) => button.getAttribute("aria-label") === "Use ?border=stone-300");
    if (!borderOption) {
      const optionLabels = [
        ...(rootElement?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? []),
      ].map((button) => button.getAttribute("aria-label"));
      throw new Error(`Expected border search param suggestion. Found: ${optionLabels.join(", ")}`);
    }

    await act(async () => {
      borderOption.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(input.value).toBe(`${origin}/logo?border=`);
    expect(readRouteHref()).toBe("/logo");
    expect(readSuggestions()?.getAttribute("data-suggestion-kind")).toBe("search-value");

    const stoneFamilyOption = [
      ...(rootElement?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? []),
    ].find((button) => button.getAttribute("aria-label") === "Use stone-500");
    if (!stoneFamilyOption) {
      const optionLabels = [
        ...(rootElement?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? []),
      ].map((button) => button.getAttribute("aria-label"));
      throw new Error(`Expected stone color family suggestion. Found: ${optionLabels.join(", ")}`);
    }

    await act(async () => {
      stoneFamilyOption.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(input.value).toBe(`${origin}/logo?border=stone-`);
    expect(readRouteHref()).toBe("/logo");
    expect(readSuggestions()?.getAttribute("data-suggestion-kind")).toBe("search-value");

    const stone300Option = [
      ...(rootElement?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? []),
    ].find((button) => button.getAttribute("aria-label") === "Use 300");
    if (!stone300Option) {
      const optionLabels = [
        ...(rootElement?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? []),
      ].map((button) => button.getAttribute("aria-label"));
      throw new Error(`Expected stone 300 shade suggestion. Found: ${optionLabels.join(", ")}`);
    }

    await act(async () => {
      stone300Option.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(input.value).toBe(`${origin}/logo?border=stone-300&`);
    expect(readRouteHref()).toBe("/logo?border=stone-300");
    expect(readSuggestions()?.getAttribute("data-suggestion-kind")).toBe("search");

    const darkOption = [
      ...(rootElement?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? []),
    ].find((button) => button.getAttribute("aria-label") === "Use &dark");
    if (!darkOption) {
      const optionLabels = [
        ...(rootElement?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? []),
      ].map((button) => button.getAttribute("aria-label"));
      throw new Error(
        `Expected dark follow-up search param suggestion. Found: ${optionLabels.join(", ")}`,
      );
    }

    await act(async () => {
      darkOption.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      await Promise.resolve();
    });

    expect(input.value).toBe(`${origin}/logo?border=stone-300&dark`);
    expect(readRouteHref()).toBe("/logo?border=stone-300&dark");

    await act(async () => {
      darkOption.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(input.value).toBe(`${origin}/logo?border=stone-300&dark&`);
    expect(readRouteHref()).toBe("/logo?border=stone-300&dark");
    expect(readSuggestions()?.getAttribute("data-suggestion-kind")).toBe("search");
    expect(document.activeElement).toBe(input);
  });

  it("opens the next search param slot after committing a value suggestion with Enter", async () => {
    const input = startEditing(["/logo"]);
    const origin = window.location.origin;

    await fillRouteUrlEditorInput(input, `${origin}/logo?leftFace=s`);
    const secondaryOption = rootElement?.querySelector<HTMLButtonElement>(
      'button[aria-label="Use secondary"]',
    );
    if (!secondaryOption) {
      throw new Error("Expected secondary search param value suggestion.");
    }

    await pressRouteUrlEditorKey(input, "ArrowDown");

    expect(secondaryOption.getAttribute("aria-selected")).toBe("true");
    expect(input.value).toBe(`${origin}/logo?leftFace=secondary`);

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(input.value).toBe(`${origin}/logo?leftFace=secondary&`);
    expect(readRouteHref()).toBe("/logo?leftFace=secondary");
    expect(readSuggestions()?.getAttribute("data-suggestion-kind")).toBe("search");
    const searchSuggestionLabels = [
      ...(rootElement?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? []),
    ].map((button) => button.getAttribute("aria-label") ?? "");
    expect(searchSuggestionLabels.some((label) => label.startsWith("Use &"))).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it("previews one numeric search example and continues after Enter", async () => {
    const input = startEditing(["/logo?depth=2"]);
    const origin = window.location.origin;

    await fillRouteUrlEditorInput(input, `${origin}/logo?depth=2&depth`);
    await act(async () => {
      input.setSelectionRange(input.value.length, input.value.length);
      input.dispatchEvent(new Event("select", { bubbles: true }));
      await Promise.resolve();
    });
    const optionButtons = [
      ...(rootElement?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? []),
    ];
    const nextDepthOption = optionButtons.find(
      (button) => button.getAttribute("aria-label") === "Use &depth=3 2 +1",
    );
    expect(optionButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Use &depth=3 2 +1",
    ]);
    if (!nextDepthOption) {
      const optionLabels = optionButtons.map((button) => button.getAttribute("aria-label") ?? "");
      throw new Error(
        `Expected next depth search param suggestion. Found: ${optionLabels.join(", ")}`,
      );
    }

    await pressRouteUrlEditorKey(input, "ArrowDown");

    expect(nextDepthOption.getAttribute("aria-selected")).toBe("true");
    expect(input.value).toBe(`${origin}/logo?depth=3`);
    expect(readRouteHref()).toBe("/logo?depth=3");
    expect(nextDepthOption.textContent).toContain("2 +1");

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(input.value).toBe(`${origin}/logo?depth=2&depth=`);
    expect(readRouteHref()).toBe("/logo?depth=2");
    expect(readSuggestions()).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("previews a numeric search example when the dropdown option is focused", async () => {
    const input = startEditing(["/logo"]);
    const origin = window.location.origin;

    await fillRouteUrlEditorInput(input, `${origin}/logo?d`);
    const optionButtons = [
      ...(rootElement?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? []),
    ];
    const nextDepthOption = optionButtons.find(
      (button) => button.getAttribute("aria-label") === "Use ?depth=2 1 +1",
    );
    expect(optionButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Use ?dark",
      "Use ?depth=2 1 +1",
      "Use ?dev",
      "Use ?devtools",
      "Use ?dist=2 1 +1",
    ]);
    if (!nextDepthOption) {
      throw new Error("Expected default depth search param suggestion.");
    }

    await pressRouteUrlEditorKey(input, "ArrowDown");

    expect(input.value).toBe(`${origin}/logo?dark`);
    expect(readRouteHref()).toBe("/logo?dark");

    await pressRouteUrlEditorKey(input, "ArrowDown");

    expect(nextDepthOption.getAttribute("aria-selected")).toBe("true");
    expect(input.value).toBe(`${origin}/logo?depth=2`);
    expect(readRouteHref()).toBe("/logo?depth=2");
    expect(nextDepthOption.textContent).toContain("1 +1");
    expect(document.activeElement).toBe(input);
  });

  it("opens the next search param slot after committing a key-only suggestion with Enter", async () => {
    const input = startEditing(["/logo"]);
    const origin = window.location.origin;

    await fillRouteUrlEditorInput(input, `${origin}/logo?devt`);
    const devtoolsOption = rootElement?.querySelector<HTMLButtonElement>(
      'button[aria-label="Use ?devtools"]',
    );
    if (!devtoolsOption) {
      throw new Error("Expected devtools search param suggestion.");
    }

    await pressRouteUrlEditorKey(input, "ArrowDown");

    expect(devtoolsOption.getAttribute("aria-selected")).toBe("true");
    expect(input.value).toBe(`${origin}/logo?devtools`);

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(input.value).toBe(`${origin}/logo?devtools&`);
    expect(readRouteHref()).toBe("/logo?devtools");
    expect(readSuggestions()?.getAttribute("data-suggestion-kind")).toBe("search");
    const searchSuggestionLabels = [
      ...(rootElement?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? []),
    ].map((button) => button.getAttribute("aria-label") ?? "");
    expect(searchSuggestionLabels.some((label) => label.startsWith("Use &"))).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it("previews color family samples as complete values", async () => {
    const input = startEditing(["/logo"]);
    const origin = window.location.origin;

    await fillRouteUrlEditorInput(input, `${origin}/logo?primary=em`);
    const emeraldFamilyOption = rootElement?.querySelector<HTMLButtonElement>(
      'button[aria-label="Use emerald-500"]',
    );
    if (!emeraldFamilyOption) {
      throw new Error("Expected emerald color family suggestion.");
    }

    await pressRouteUrlEditorKey(input, "ArrowDown");

    expect(emeraldFamilyOption.getAttribute("aria-selected")).toBe("true");
    expect(input.value).toBe(`${origin}/logo?primary=emerald-500`);
    expect(readRouteHref()).toBe("/logo?primary=emerald-500");

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(input.value).toBe(`${origin}/logo?primary=emerald-`);
    expect(readRouteHref()).toBe("/logo");
    expect(readSuggestions()?.getAttribute("data-suggestion-kind")).toBe("search-value");
    expect(rootElement?.querySelector('button[aria-label="Use 500"]')).not.toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("previews color shade samples as complete values", async () => {
    const input = startEditing(["/logo"]);
    const origin = window.location.origin;

    await fillRouteUrlEditorInput(input, `${origin}/logo?primary=blue-`);
    expect(readSuggestions()?.getAttribute("data-suggestion-kind")).toBe("search-value");
    expect(rootElement?.querySelector('button[aria-label="Use 50"]')).not.toBeNull();
    expect(rootElement?.querySelector('button[aria-label="Use 500"]')).not.toBeNull();

    const blue500Option = rootElement?.querySelector<HTMLButtonElement>(
      'button[aria-label="Use 500"]',
    );
    if (!blue500Option) {
      throw new Error("Expected blue 500 shade suggestion.");
    }

    await act(async () => {
      blue500Option.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(input.value).toBe(`${origin}/logo?primary=blue-500&`);
    expect(readRouteHref()).toBe("/logo?primary=blue-500");
    expect(readSuggestions()?.getAttribute("data-suggestion-kind")).toBe("search");
    expect(document.activeElement).toBe(input);
  });

  it("opens an unfinished value after selecting a valued search param sample", async () => {
    const input = startEditing(["/logo"]);
    const origin = window.location.origin;

    await fillRouteUrlEditorInput(input, `${origin}/logo?vo`);
    const voxOption = rootElement?.querySelector<HTMLButtonElement>(
      `button[aria-label="Use ?vox=${DEFAULT_LOGO_VOXEL_STATE_SUGGESTION}"]`,
    );
    if (!voxOption) {
      throw new Error("Expected vox search param suggestion.");
    }

    await act(async () => {
      voxOption.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(input.value).toBe(`${origin}/logo?vox=`);
    expect(readRouteHref()).toBe("/logo");
    expect(readSuggestions()?.getAttribute("data-suggestion-kind")).toBe("search-value");
    expect(
      rootElement?.querySelector(`button[aria-label="Use ${DEFAULT_LOGO_VOXEL_STATE_SUGGESTION}"]`),
    ).not.toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("keeps typed unfinished valued search params local", async () => {
    const input = startEditing(["/logo"]);
    const origin = window.location.origin;

    await fillRouteUrlEditorInput(input, `${origin}/logo?rot=`);

    expect(input.value).toBe(`${origin}/logo?rot=`);
    expect(readRouteHref()).toBe("/logo");

    await fillRouteUrlEditorInput(input, `${origin}/logo?leftFace=s`);

    expect(input.value).toBe(`${origin}/logo?leftFace=s`);
    expect(readRouteHref()).toBe("/logo");
    expect(readSuggestions()?.getAttribute("data-suggestion-kind")).toBe("search-value");
  });
});
