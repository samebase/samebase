import { describe, expect, it } from "vite-plus/test";
import { isVisualFixtureRouteAvailableOnHostname } from "./visualFixtureRouteAvailability";

describe("isVisualFixtureRouteAvailableOnHostname", () => {
  it("allows loopback hosts used by local dev and local previews", () => {
    expect(isVisualFixtureRouteAvailableOnHostname("localhost")).toBe(true);
    expect(isVisualFixtureRouteAvailableOnHostname("  LOCALHOST  ")).toBe(true);
    expect(isVisualFixtureRouteAvailableOnHostname("127.0.0.1")).toBe(true);
    expect(isVisualFixtureRouteAvailableOnHostname("0.0.0.0")).toBe(true);
    expect(isVisualFixtureRouteAvailableOnHostname("::1")).toBe(true);
    expect(isVisualFixtureRouteAvailableOnHostname("[::1]")).toBe(true);
  });

  it("rejects production and preview hostnames", () => {
    expect(isVisualFixtureRouteAvailableOnHostname("noter.md")).toBe(false);
    expect(isVisualFixtureRouteAvailableOnHostname("www.noter.md")).toBe(false);
    expect(isVisualFixtureRouteAvailableOnHostname("preview.noter.md")).toBe(false);
    expect(
      isVisualFixtureRouteAvailableOnHostname("codex-dashboard-main-pane-spacing.noter.pages.dev"),
    ).toBe(false);
    expect(isVisualFixtureRouteAvailableOnHostname("a3070b07.noter-ax1.pages.dev")).toBe(false);
    expect(isVisualFixtureRouteAvailableOnHostname("")).toBe(false);
  });
});
