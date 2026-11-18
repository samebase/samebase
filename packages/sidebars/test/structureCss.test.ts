/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { SIDEBAR_LAYOUT_DESKTOP_MIN_WIDTH_PX } from "../src/SidebarLayoutGeometryInternal.ts";

const structureCss = readFileSync(new URL("../src/structure.css", import.meta.url), "utf8");

describe("sidebar layout structural CSS", () => {
  it("uses border-box sizing for every part and its separator pseudo-elements", () => {
    expect(structureCss).toContain(`:where([data-sidebar-layout-part]),
:where([data-sidebar-layout-part])::before,
:where([data-sidebar-layout-part])::after {
  box-sizing: border-box;
}`);
  });

  it("switches between mobile and desktop at the runtime desktop width", () => {
    expect(new Set(structureCss.match(/@media \([^)]*\)/g))).toEqual(
      new Set([
        `@media (max-width: ${SIDEBAR_LAYOUT_DESKTOP_MIN_WIDTH_PX - 1}px)`,
        `@media (min-width: ${SIDEBAR_LAYOUT_DESKTOP_MIN_WIDTH_PX}px)`,
      ]),
    );
  });

  it("keeps pane headers and content scrollports as inline-size query containers", () => {
    expect(structureCss).toContain(`:where([data-sidebar-layout-part="pane-header"]) {
  container-type: inline-size;`);
    expect(structureCss).toContain(`:where([data-sidebar-layout-part="pane-scrollport"]) {
  container-type: inline-size;`);
  });

  it("keeps a themeable visible focus fallback on resize handles", () => {
    expect(structureCss).toContain(
      ':where([data-sidebar-layout-part="resize-handle"]:focus-visible)',
    );
    expect(structureCss).toContain(
      "outline: var(--sidebar-layout-focus-outline, 2px solid Highlight);",
    );
  });

  it("leaves visible grip styling to the consumer", () => {
    const gripRules = structureCss.slice(
      structureCss.indexOf(':where([data-sidebar-layout-part="resize-track"])'),
      structureCss.indexOf(':where([data-sidebar-layout-part="pane-frame"])'),
    );

    expect(gripRules).not.toContain("background:");
    expect(gripRules).not.toContain("border-radius:");
    expect(gripRules).not.toContain("box-shadow:");
    expect(gripRules).not.toContain("color:");
  });
});
