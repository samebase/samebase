// @vitest-environment jsdom

import * as React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { APP_BUILD_STATUS_BAR_TEST_ID } from "@/lib/appBuild";
import { LOCAL_STORAGE_ROUTE } from "@/lib/localStorageRoute";
import { AppSidebarMetaSection } from "./AppSidebarMetaSection";

const { act } = React;

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

describe("AppSidebarMetaSection", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) {
      const mountedRoot = root;
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }

    rootElement?.remove();
    rootElement = null;
  });

  function LocationProbe() {
    const location = useLocation();

    return (
      <output data-href={location.href} data-testid="router-location">
        {location.pathname}
        {location.searchStr}
      </output>
    );
  }

  function BackLink() {
    return <Link to="/">home</Link>;
  }

  async function settleRouteUpdate() {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  async function renderSidebarMetaSection(
    initialEntry = "/",
    {
      extra,
      linkAlignment = "left",
    }: {
      extra?: React.ReactNode;
      linkAlignment?: "left" | "right";
    } = {},
  ) {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    const mountedRoot = createRoot(rootElement);
    root = mountedRoot;

    await act(async () => {
      mountedRoot.render(
        <TestRouterProvider initialEntries={[initialEntry]}>
          <AppSidebarMetaSection linkAlignment={linkAlignment} />
          {extra}
          <LocationProbe />
        </TestRouterProvider>,
      );
      await settleRouteUpdate();
    });

    return rootElement;
  }

  function readLocationText() {
    return rootElement?.querySelector('[data-testid="router-location"]')?.textContent ?? "";
  }

  function readLocationHref() {
    return (
      rootElement?.querySelector('[data-testid="router-location"]')?.getAttribute("data-href") ?? ""
    );
  }

  async function clickLink(link: HTMLAnchorElement) {
    await act(async () => {
      link.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          button: 0,
          cancelable: true,
        }),
      );
      await settleRouteUpdate();
    });
  }

  it("omits hidden dev shortcuts from prerendered markup", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/"]}>
        <AppSidebarMetaSection linkAlignment="left" />
      </TestRouterProvider>,
    );

    expect(markup).not.toContain('id="public-landing-prod-ui-toggle"');
    expect(markup).not.toContain(">?prod-ui<");
    expect(markup).not.toContain('id="public-local-storage-route-link"');
    expect(markup).not.toContain(`>${LOCAL_STORAGE_ROUTE}<`);
    expect(markup).not.toContain(">/landing-preview<");
  });

  it("does not add hidden dev shortcuts after local browser load", async () => {
    await renderSidebarMetaSection();

    const prodUiShortcut = rootElement?.querySelector("#public-landing-prod-ui-toggle");
    const localStorageShortcut = rootElement?.querySelector("#public-local-storage-route-link");

    expect(prodUiShortcut).toBeNull();
    expect(localStorageShortcut).toBeNull();
    expect(rootElement?.textContent).not.toContain("?prod-ui");
    expect(rootElement?.textContent).not.toContain(LOCAL_STORAGE_ROUTE);
    expect(rootElement?.textContent).not.toContain("/landing-preview");
  });

  it("omits the landing preview path link while keeping preview query shortcuts", async () => {
    const element = await renderSidebarMetaSection("/landing-preview");
    const landingPreviewPathLink = [...element.querySelectorAll<HTMLAnchorElement>("a")].find(
      (link) => link.textContent === "/landing-preview",
    );
    const romanianQueryLink = element.querySelector<HTMLAnchorElement>(
      "#landing-preview-romanian-toggle",
    );

    expect(landingPreviewPathLink).toBeUndefined();
    expect(romanianQueryLink?.textContent).toBe("?lang=ro");
  });

  it("keeps active suffixes outside the toggle hit target", async () => {
    const element = await renderSidebarMetaSection("/?dev");
    const devSuffix = element.querySelector<HTMLSpanElement>(
      '[data-testid="public-landing-dev-toggle-suffix"]',
    );
    if (!devSuffix) {
      throw new Error("Expected public landing dev shortcut suffix.");
    }

    await act(async () => {
      devSuffix.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          button: 0,
          cancelable: true,
        }),
      );
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/?dev");
  });

  it("toggles an active theme shortcut through the committed router location", async () => {
    const element = await renderSidebarMetaSection("/?dev&dark");
    const darkLink = element.querySelector<HTMLAnchorElement>("#public-landing-theme-dark-toggle");
    if (!darkLink) {
      throw new Error("Expected public landing dark shortcut.");
    }

    await clickLink(darkLink);

    expect(readLocationHref()).toBe("/?dev");
    expect(darkLink.textContent).toBe("?dark");
    expect(darkLink.getAttribute("aria-label")).toBe("?dark");
  });

  it("navigates path links without hover preview state", async () => {
    const element = await renderSidebarMetaSection("/", {
      extra: <BackLink />,
    });
    const termsLink = [...element.querySelectorAll<HTMLAnchorElement>("a")].find(
      (link) => link.textContent === "/terms",
    );
    const backLink = [...element.querySelectorAll<HTMLAnchorElement>("a")].find(
      (link) => link.textContent === "home",
    );
    if (!termsLink || !backLink) {
      throw new Error("Expected terms and home links.");
    }

    await act(async () => {
      termsLink.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationHref()).toBe("/");

    await clickLink(termsLink);

    expect(readLocationHref()).toBe("/terms");

    await clickLink(backLink);

    expect(readLocationHref()).toBe("/");
  });

  it("uses the same committed search state for right-aligned query links", async () => {
    const element = await renderSidebarMetaSection("/?light", {
      linkAlignment: "right",
    });
    const lightLink = element.querySelector<HTMLAnchorElement>(
      "#public-landing-theme-light-toggle",
    );
    if (!lightLink) {
      throw new Error("Expected public landing light shortcut.");
    }

    expect(
      element.querySelector(`[data-testid="${APP_BUILD_STATUS_BAR_TEST_ID}"]`)?.className,
    ).toContain("text-right");
    expect(lightLink.textContent).toBe("?light");
    expect(lightLink.getAttribute("aria-label")).toBe("?light-");
  });
});
