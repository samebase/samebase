import { describe, expect, it } from "vite-plus/test";
import { isPublicLayoutShellPathname, readPublicLayoutShellPathname } from "./publicLayoutPaths";

describe("readPublicLayoutShellPathname", () => {
  it("normalizes trailing slashes without changing root", () => {
    expect(readPublicLayoutShellPathname("/")).toBe("/");
    expect(readPublicLayoutShellPathname("/localStorage/")).toBe("/localStorage");
    expect(readPublicLayoutShellPathname("/logo/iso/")).toBe("/logo/iso");
  });
});

describe("isPublicLayoutShellPathname", () => {
  it("recognizes the public shell routes", () => {
    expect(isPublicLayoutShellPathname("/")).toBe(true);
    expect(isPublicLayoutShellPathname("/terms")).toBe(true);
    expect(isPublicLayoutShellPathname("/privacy")).toBe(true);
    expect(isPublicLayoutShellPathname("/localStorage/")).toBe(true);
    expect(isPublicLayoutShellPathname("/logo/iso")).toBe(true);
    expect(isPublicLayoutShellPathname("/home")).toBe(false);
    expect(isPublicLayoutShellPathname("/visual-fixture")).toBe(false);
  });
});
