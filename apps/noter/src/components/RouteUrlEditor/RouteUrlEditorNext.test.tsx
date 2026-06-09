// @vitest-environment jsdom

import * as React from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
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

function RouteUrlEditorLocationProbe() {
  const location = useLocation();
  return <output data-testid="route-url-editor-test-href">{location.href}</output>;
}

function MachinesRouteRepairProbe() {
  const location = useLocation();
  const router = useRouter();

  React.useEffect(() => {
    if (location.href === "/machines?machineId=machine_hGHmmpu_m6MYcAa") {
      router.history.replace("/machines?machineId=machine_hGHmmpu_m6MYcAaF");
    }
  }, [location.href, router]);

  return null;
}

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
    useQueryMock.mockReset();
    window.history.replaceState(null, "", "/");
  });

  function renderEditor(initialEntries: string[]): HTMLInputElement {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    const mountedRoot = createRoot(rootElement);
    root = mountedRoot;

    act(() => {
      mountedRoot.render(
        <TestRouterProvider initialEntries={initialEntries}>
          <RouteUrlEditorNext />
          <MachinesRouteRepairProbe />
          <RouteUrlEditorLocationProbe />
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

  function readRouteHref(): string {
    const routeHref = rootElement?.querySelector<HTMLOutputElement>(
      '[data-testid="route-url-editor-test-href"]',
    );
    if (!routeHref?.textContent) {
      throw new Error("Expected route URL editor route href probe.");
    }

    return routeHref.textContent;
  }

  async function backspaceRouteUrlEditorInput(input: HTMLInputElement): Promise<void> {
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Backspace" }));
      if (input.value.length > 0) {
        const nextValue = input.value.slice(0, -1);
        const valueDescriptor = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        );
        if (typeof valueDescriptor?.set === "function") {
          valueDescriptor.set.call(input, nextValue);
        } else {
          input.value = nextValue;
        }
        input.setSelectionRange(input.value.length, input.value.length);
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Backspace" }));
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }

  it("keeps focus when the current route repairs same-path search while Backspace edits", async () => {
    useQueryMock.mockReturnValue(true);
    const display = renderEditor(["/machines?machineId=machine_hGHmmpu_m6MYcAaF"]);
    const origin = window.location.origin;

    act(() => {
      display.focus();
    });

    const input = readRequiredInput();
    expect(input.value).toBe(`${origin}/machines?machineId=machine_hGHmmpu_m6MYcAaF&`);

    await backspaceRouteUrlEditorInput(input);
    expect(input.value).toBe(`${origin}/machines?machineId=machine_hGHmmpu_m6MYcAaF`);
    expect(document.activeElement).toBe(input);

    await backspaceRouteUrlEditorInput(input);

    expect(readRouteHref()).toBe("/machines?machineId=machine_hGHmmpu_m6MYcAaF");
    expect(input.value).toBe(`${origin}/machines?machineId=machine_hGHmmpu_m6MYcAa`);
    expect(document.activeElement).toBe(input);
  });
});
