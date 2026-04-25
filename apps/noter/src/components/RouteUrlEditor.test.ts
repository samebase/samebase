import { describe, expect, it } from "vite-plus/test";

import { resolveEditableRouteHref } from "@/lib/routeUrlEditor";

describe("resolveEditableRouteHref", () => {
  it("accepts app-relative routes", () => {
    expect(resolveEditableRouteHref("/?dev")).toEqual({
      href: "/?dev",
      ok: true,
    });
  });

  it("accepts same-origin absolute URLs as app routes", () => {
    expect(
      resolveEditableRouteHref(
        "http://localhost:5174/terms?dev#legal",
        "http://localhost:5174",
      ),
    ).toEqual({
      href: "/terms?dev#legal",
      ok: true,
    });
  });

  it("rejects protocol-relative and external URLs", () => {
    expect(
      resolveEditableRouteHref("//example.com", "http://localhost:5174").ok,
    ).toBe(false);
    expect(
      resolveEditableRouteHref("https://example.com/", "http://localhost:5174")
        .ok,
    ).toBe(false);
  });
});
