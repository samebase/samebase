/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const structureCss = readFileSync(new URL("../src/structure.css", import.meta.url), "utf8");

describe("workspace layout structural CSS", () => {
  it("uses border-box sizing for every part and its separator pseudo-elements", () => {
    expect(structureCss).toContain(`:where([data-workspace-layout-part]),
:where([data-workspace-layout-part])::before,
:where([data-workspace-layout-part])::after {
  box-sizing: border-box;
}`);
  });

  it("keeps one exact mobile and desktop boundary", () => {
    expect(structureCss.match(/@media \(max-width: 767px\)/g)).toHaveLength(1);
    expect(structureCss.match(/@media \(min-width: 768px\)/g)).toHaveLength(1);
    expect(structureCss).not.toMatch(/@media \((?:max-width: 768px|min-width: 767px)\)/);
  });

  it("uses canonical pane parts for mobile separators", () => {
    expect(structureCss).toContain(':where([data-workspace-layout-part="pane"])::before,');
    expect(structureCss).toContain(
      '[data-workspace-layout-part="viewport"][data-mobile-pane="main"]',
    );
  });

  it("keeps a themeable visible focus fallback on resize handles", () => {
    expect(structureCss).toContain(
      ':where([data-workspace-layout-part="resize-handle"]:focus-visible)',
    );
    expect(structureCss).toContain(
      "outline: var(--workspace-layout-v2-focus-outline, 2px solid Highlight);",
    );
    expect(structureCss).toContain("outline-offset: -2px;");
  });

  it("centers grip tracks while leaving visible grip styling to the consumer", () => {
    const gripRules = structureCss.slice(
      structureCss.indexOf(':where([data-workspace-layout-part="resize-track"])'),
      structureCss.indexOf(':where([data-workspace-layout-part="pane-frame"])'),
    );

    expect(gripRules).toContain("width: 2rem;");
    expect(gripRules).toContain("transform: translateX(-50%);");
    expect(gripRules).toContain("align-items: center;");
    expect(gripRules).toContain("justify-content: center;");
    expect(gripRules).not.toContain("background:");
    expect(gripRules).not.toContain("border-radius:");
    expect(gripRules).not.toContain("box-shadow:");
    expect(gripRules).not.toContain("color:");
  });
});
