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
});
