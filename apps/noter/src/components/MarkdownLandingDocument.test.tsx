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

  it("keeps authored image dimensions for README logos", () => {
    const element = renderMarkdown(
      '<img src="/landing-preview/logos/github.svg" alt="GitHub" height="32">',
    );

    const image = element.querySelector("img");
    expect(image?.getAttribute("height")).toBe("32");
    expect(image?.style.height).toBe("32px");
    expect(image?.style.width).toBe("auto");
  });

  it("renders video image markdown as a playable video", () => {
    const element = renderMarkdown("![Demo video](/demo.mp4)");

    const video = element.querySelector("video");
    expect(video?.controls).toBe(true);
    expect(video?.playsInline).toBe(true);
    expect(video?.getAttribute("preload")).toBe("metadata");
    expect(video?.getAttribute("src")).toBe("/demo.mp4");
  });

  it("keeps sanitized raw video tags for README-compatible embeds", () => {
    const element = renderMarkdown(
      '<video controls src="https://example.com/demo.webm" onclick="alert(1)"></video>',
    );

    const video = element.querySelector("video");
    expect(video?.getAttribute("src")).toBe("https://example.com/demo.webm");
    expect(video?.getAttribute("onclick")).toBeNull();
  });

  it("renders README disclosure blocks with local videos", () => {
    const element = renderMarkdown(`
<details onclick="alert(1)">
<summary>Step 1 video</summary>

<video controls preload="metadata" src="/landing-preview/step-1.mp4"></video>

</details>
`);

    const details = element.querySelector("details");
    const summary = element.querySelector("summary");
    const video = element.querySelector("video");

    expect(details).not.toBeNull();
    expect(details?.getAttribute("onclick")).toBeNull();
    expect(summary?.textContent).toBe("Step 1 video");
    expect(video?.getAttribute("src")).toBe("/landing-preview/step-1.mp4");
    expect(video?.getAttribute("preload")).toBe("metadata");
  });

  it("renders README task checkboxes as local interactive controls", () => {
    const element = renderMarkdown("- [ ] Create account");

    const checkbox = element.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    expect(checkbox?.hasAttribute("disabled")).toBe(false);
    expect(checkbox?.checked).toBe(false);

    act(() => {
      checkbox?.click();
    });

    expect(checkbox?.checked).toBe(true);
  });

  it("uses explicit heading markers as hash anchors", () => {
    const element = renderMarkdown("## Accounts {#accounts}");

    const heading = element.querySelector("h2");
    expect(heading?.id).toBe("accounts");
    expect(heading?.textContent).toBe("Accounts");
  });

  it("detects common video file URLs", () => {
    expect(isMarkdownVideoUrl("https://example.com/demo.MP4?download=1")).toBe(
      true,
    );
    expect(isMarkdownVideoUrl("/assets/demo.gif")).toBe(false);
  });
});
