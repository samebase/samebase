// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { MarkdownLandingDocument } from "@/components/MarkdownLandingDocument";
import { isMarkdownVideoUrl } from "@/lib/landingMarkdownMedia";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

describe("MarkdownLandingDocument", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;

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

  function renderMarkdown(markdown: string) {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    act(() => {
      root?.render(<MarkdownLandingDocument markdown={markdown} />);
    });

    return rootElement;
  }

  it("renders gif markdown as an image", () => {
    const element = renderMarkdown("![Looping demo](/demo.gif)");

    const image = element.querySelector("img");
    expect(image?.getAttribute("src")).toBe("/demo.gif");
    expect(image?.getAttribute("alt")).toBe("Looping demo");
  });

  it("renders video image markdown as a playable video", () => {
    const element = renderMarkdown("![Demo video](/demo.mp4)");

    const video = element.querySelector("video");
    const source = element.querySelector("source");
    expect(video?.controls).toBe(true);
    expect(video?.playsInline).toBe(true);
    expect(video?.getAttribute("preload")).toBe("metadata");
    expect(source?.getAttribute("src")).toBe("/demo.mp4");
  });

  it("keeps sanitized raw video tags for README-compatible embeds", () => {
    const element = renderMarkdown(
      '<video controls src="https://example.com/demo.webm" onclick="alert(1)"></video>',
    );

    const video = element.querySelector("video");
    expect(video?.getAttribute("src")).toBeNull();
    expect(video?.getAttribute("onclick")).toBeNull();
    expect(video?.querySelector("source")?.getAttribute("src")).toBe(
      "https://example.com/demo.webm",
    );
  });

  it("detects common video file URLs", () => {
    expect(isMarkdownVideoUrl("https://example.com/demo.MP4?download=1")).toBe(
      true,
    );
    expect(isMarkdownVideoUrl("/assets/demo.gif")).toBe(false);
  });
});
