// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { LandingCopy } from "@/components/LandingCopy";

const { act } = React;

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

vi.mock("@/components/ProsemarkReadOnly", () => ({
  ProsemarkReadOnly: ({
    className,
    editable,
    onChange,
    value,
  }: {
    className?: string;
    editable?: boolean;
    onChange?: (value: string) => void;
    value: string;
  }) => (
    <button
      className={className}
      data-component="ProsemarkReadOnly"
      data-editable={String(editable)}
      onClick={() => onChange?.(`${value} changed`)}
      type="button"
    >
      {value}
    </button>
  ),
}));

describe("LandingCopy", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

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
  });

  function createMountedRoot() {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);
    return root;
  }

  async function settleLazyRender() {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  it("renders static landing markdown without editor chrome", () => {
    const mountedRoot = createMountedRoot();

    act(() => {
      mountedRoot.render(
        <LandingCopy
          className="copy-shell"
          markdown={
            "## Ship from notes\n\n- Own the workflow\n- Keep local context\n\nNo install wall."
          }
        />,
      );
    });

    expect(rootElement?.querySelector('[data-component="ProsemarkReadOnly"]')).toBeNull();
    expect(rootElement?.querySelector(".cm-editor")).toBeNull();
    expect(rootElement?.querySelector('[contenteditable="true"]')).toBeNull();
    expect(rootElement?.querySelector("h2")?.textContent).toBe("Ship from notes");
    expect(
      Array.from(rootElement?.querySelectorAll("li") ?? [], (item) => item.textContent),
    ).toEqual(["• Own the workflow", "• Keep local context"]);
    expect(rootElement?.querySelector("p")?.textContent).toBe("No install wall.");
    expect(rootElement?.querySelector(".copy-shell")).not.toBeNull();
  });

  it("loads the editable ProseMark surface in browser dev mode", async () => {
    const mountedRoot = createMountedRoot();
    const changedValues: string[] = [];
    const markdown = "## Editable copy\n\n- Keep it local";

    await act(async () => {
      mountedRoot.render(
        <LandingCopy
          className="copy-shell"
          editable
          markdown={markdown}
          onChange={(value) => changedValues.push(value)}
        />,
      );
      await settleLazyRender();
    });

    const editor = rootElement?.querySelector<HTMLButtonElement>(
      '[data-component="ProsemarkReadOnly"]',
    );
    expect(editor).not.toBeNull();
    expect(editor?.className).toContain("copy-shell");
    expect(editor?.className).toContain("pt-px");
    expect(editor?.getAttribute("data-editable")).toBe("true");
    expect(editor?.textContent).toBe(markdown);

    await act(async () => {
      editor?.click();
    });

    expect(changedValues).toEqual([`${markdown} changed`]);
  });
});
