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
    ).toBe("/logo?dev#controls");
  });

  it("resolves search and hash edits against the current route", () => {
    expect(
      normalizeRouteUrlEditorHref({
        currentHref: "/logo?dev#controls",
        origin: ORIGIN,
        rawHref: "?prod-ui#preview",
      }),
    ).toBe("/logo?prod-ui#preview");
  });

  it("rejects full URLs because the editor owns the origin prefix", () => {
    expect(
      normalizeRouteUrlEditorHref({
        currentHref: "/",
        origin: ORIGIN,
        rawHref: "https://noter.local/terms?dev",
      }),
    ).toBeNull();
  });

  it("rejects text without a route delimiter", () => {
    expect(
      normalizeRouteUrlEditorHref({
        currentHref: "/visual-fixture?mode=route-url-editor",
        origin: "http://localhost:5174",
        rawHref: "logo?dev",
      }),
    ).toBeNull();
  });

  it("rejects protocol-relative external origins", () => {
    expect(
      normalizeRouteUrlEditorHref({
        currentHref: "/visual-fixture?mode=route-url-editor",
        origin: "http://localhost:5174",
        rawHref: "//example.com/noter",
      }),
    ).toBeNull();
  });

  it("rejects empty input", () => {
    expect(
      normalizeRouteUrlEditorHref({
        currentHref: "/",
        origin: ORIGIN,
        rawHref: "  ",
      }),
    ).toBeNull();
  });
});
