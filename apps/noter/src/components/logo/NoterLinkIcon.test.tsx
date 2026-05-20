// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { NoterLinkIcon } from "@/components/logo/NoterLinkIcon";
import { DEFAULT_STATIC_LOGO_SVG_URL } from "@/components/logo/logoStaticSvgContract";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

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

  it("renders the canonical static logo as a decorative link icon", () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    act(() => {
      root?.render(<NoterLinkIcon />);
    });

    const image = rootElement.querySelector("img");
    expect(image?.getAttribute("src")).toBe(DEFAULT_STATIC_LOGO_SVG_URL);
    expect(image?.getAttribute("alt")).toBe("");
    expect(image?.getAttribute("aria-hidden")).toBe("true");
    expect(image?.className).toContain("h-5 w-5");
  });
});
