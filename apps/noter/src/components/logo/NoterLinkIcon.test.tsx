// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  NoterLinkIcon,
  type NoterLinkIconState,
} from "@/components/logo/NoterLinkIcon";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

function renderIconMarkup(state: NoterLinkIconState) {
  return renderToStaticMarkup(<NoterLinkIcon state={state} />);
}

function readPolygonPoints(markup: string) {
  const rootElement = document.createElement("div");
  rootElement.innerHTML = markup;

  return Array.from(rootElement.querySelectorAll("polygon")).map((polygon) =>
    polygon.getAttribute("points"),
  );
}

describe("NoterLinkIcon", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

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
  });

  it("renders a monochrome inline mark as a decorative link icon", () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    act(() => {
      root?.render(<NoterLinkIcon />);
    });

    const svg = rootElement.querySelector("svg");
    expect(rootElement.querySelector("img")).toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("data-logo-state")).toBe("idle");
    expect(svg?.className.baseVal).toContain("h-5 w-5");

    const markup = rootElement.innerHTML;
    expect(markup).toContain("currentColor");
    expect(markup).toContain("<pattern");
    expect(markup).not.toContain("#ecfccb");
    expect(markup).not.toContain("#394447");
  });

  it("uses different projected face points for hover and pressed states", () => {
    const idlePoints = readPolygonPoints(renderIconMarkup("idle"));
    const hoverPoints = readPolygonPoints(renderIconMarkup("hover"));
    const activePoints = readPolygonPoints(renderIconMarkup("active"));

    expect(hoverPoints).not.toEqual(idlePoints);
    expect(activePoints).not.toEqual(hoverPoints);
  });
});
