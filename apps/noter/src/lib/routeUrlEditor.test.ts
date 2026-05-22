import { describe, expect, it } from "vite-plus/test";
import { normalizeRouteUrlEditorHref } from "./routeUrlEditor";

const ORIGIN = "https://noter.local";

describe("normalizeRouteUrlEditorHref", () => {
  it("keeps same-origin app paths as route hrefs", () => {
    expect(
      normalizeRouteUrlEditorHref({
        currentHref: "/visual-fixture?mode=route-url-editor",
        origin: ORIGIN,
        rawHref: "/logo?dev#controls",
      }),
    ).toEqual({
      status: "valid",
      href: "/logo?dev#controls",
    });
  });

  it("resolves search and hash edits against the current route", () => {
    expect(
      normalizeRouteUrlEditorHref({
        currentHref: "/logo?dev#controls",
        origin: ORIGIN,
        rawHref: "?prod-ui#preview",
      }),
    ).toEqual({
      status: "valid",
      href: "/logo?prod-ui#preview",
    });
  });

  it("accepts same-origin absolute URLs but stores only the app href", () => {
    expect(
      normalizeRouteUrlEditorHref({
        currentHref: "/",
        origin: ORIGIN,
        rawHref: "https://noter.local/terms?dev",
      }),
    ).toEqual({
      status: "valid",
      href: "/terms?dev",
    });
  });

  it("rejects empty input", () => {
    expect(
      normalizeRouteUrlEditorHref({
        currentHref: "/",
        origin: ORIGIN,
        rawHref: "  ",
      }),
    ).toEqual({
      status: "invalid",
      reason: "empty",
    });
  });

  it("rejects external origins", () => {
    expect(
      normalizeRouteUrlEditorHref({
        currentHref: "/",
        origin: ORIGIN,
        rawHref: "https://example.com/logo",
      }),
    ).toEqual({
      status: "invalid",
      reason: "external-origin",
    });
  });
});
