// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { useLocation } from "@tanstack/react-router";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { LOCAL_STORAGE_ROUTE } from "@/lib/localStorageRoute";
import { AppSidebarMetaRoutePreviewProvider, AppSidebarMetaSection } from "./AppSidebarMetaSection";

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

  async function settleRouteUpdate() {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  async function renderSidebarMetaSection(initialEntry = "/", side: "left" | "right" = "right") {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    const mountedRoot = createRoot(rootElement);
    root = mountedRoot;

    await act(async () => {
      mountedRoot.render(
        <TestRouterProvider initialEntries={[initialEntry]}>
          <AppSidebarMetaSection side={side} />
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

  async function renderRouteOwnedSidebar(initialEntry = "/home#noter") {
    function RouteOwnedSidebarHarness() {
      const pathname = useLocation({
        select: (location) => location.pathname,
      });

      return (
        <>
          <AppSidebarMetaSection key={pathname} side="right" />
          <LocationProbe />
        </>
      );
    }

    rootElement = document.createElement("div");
    document.body.append(rootElement);
    const element = rootElement;
    const mountedRoot = createRoot(rootElement);
    root = mountedRoot;

    await act(async () => {
      mountedRoot.render(
        <TestRouterProvider initialEntries={[initialEntry]}>
          <AppSidebarMetaRoutePreviewProvider>
            <RouteOwnedSidebarHarness />
          </AppSidebarMetaRoutePreviewProvider>
        </TestRouterProvider>,
      );
      await settleRouteUpdate();
    });

    return element;
  }

  async function renderSharedSidebarMetaSections(initialEntry = "/") {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    const element = rootElement;
    const mountedRoot = createRoot(rootElement);
    root = mountedRoot;

    await act(async () => {
      mountedRoot.render(
        <TestRouterProvider initialEntries={[initialEntry]}>
          <AppSidebarMetaRoutePreviewProvider>
            <section data-testid="right-rail">
              <AppSidebarMetaSection side="right" />
            </section>
            <section data-testid="left-rail">
              <AppSidebarMetaSection side="left" />
            </section>
            <LocationProbe />
          </AppSidebarMetaRoutePreviewProvider>
        </TestRouterProvider>,
      );
      await settleRouteUpdate();
    });

    return element;
  }

  it("omits hidden dev shortcuts from prerendered markup", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/"]}>
        <AppSidebarMetaSection side="right" />
      </TestRouterProvider>,
    );

    expect(markup).not.toContain('id="public-landing-prod-ui-toggle"');
    expect(markup).not.toContain(">?prod-ui<");
    expect(markup).not.toContain('id="public-local-storage-route-link"');
    expect(markup).not.toContain(`>${LOCAL_STORAGE_ROUTE}<`);
    expect(markup).not.toContain(">/landing-preview<");
  });

  it("does not add hidden dev shortcuts after local browser load", () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    const mountedRoot = createRoot(rootElement);
    root = mountedRoot;

    act(() => {
      mountedRoot.render(
        <TestRouterProvider initialEntries={["/"]}>
          <AppSidebarMetaSection side="right" />
        </TestRouterProvider>,
      );
    });

    const prodUiShortcut = rootElement.querySelector("#public-landing-prod-ui-toggle");
    const localStorageShortcut = rootElement.querySelector("#public-local-storage-route-link");

    expect(prodUiShortcut).toBeNull();
    expect(localStorageShortcut).toBeNull();
    expect(rootElement.textContent).not.toContain("?prod-ui");
    expect(rootElement.textContent).not.toContain(LOCAL_STORAGE_ROUTE);
    expect(rootElement.textContent).not.toContain("/landing-preview");
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

  it("renders hover-preview links with a pressed click state", async () => {
    const element = await renderSidebarMetaSection();
    const devLink = element.querySelector<HTMLAnchorElement>("#public-landing-dev-toggle");
    const termsLink = [...element.querySelectorAll<HTMLAnchorElement>("a")].find(
      (link) => link.textContent === "/terms",
    );
    if (!devLink || !termsLink) {
      throw new Error("Expected public landing preview shortcuts.");
    }

    expect(devLink.className).toContain("active:bg-foreground");
    expect(devLink.className).toContain("active:text-background");
    expect(devLink.className).toContain("route-preview-link-interaction");
    expect(termsLink.className).toContain("active:bg-foreground");
    expect(termsLink.className).toContain("active:text-background");
    expect(termsLink.className).toContain("route-preview-link-interaction");
  });

  it("previews and restores non-reset landing query shortcuts on hover", async () => {
    const element = await renderSidebarMetaSection();
    const devLink = element.querySelector<HTMLAnchorElement>("#public-landing-dev-toggle");
    if (!devLink) {
      throw new Error("Expected public landing dev shortcut.");
    }

    await act(async () => {
      devLink.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/?dev");
    expect(devLink.textContent).toBe("?dev");
    expect(devLink.getAttribute("aria-label")).toBe("?dev-");

    await act(async () => {
      devLink.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/");
    expect(devLink.textContent).toBe("?dev");
    expect(devLink.getAttribute("aria-label")).toBe("?dev");
  });

  it("previews reset without hiding the reset shortcut", async () => {
    const element = await renderSidebarMetaSection("/?light");
    const resetLink = element.querySelector<HTMLAnchorElement>("#public-landing-search-reset");
    if (!resetLink) {
      throw new Error("Expected public landing reset shortcut.");
    }

    await act(async () => {
      resetLink.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/");
    expect(rootElement?.querySelector("#public-landing-search-reset")).not.toBeNull();

    const previewResetLink = rootElement?.querySelector<HTMLAnchorElement>(
      "#public-landing-search-reset",
    );
    if (!previewResetLink) {
      throw new Error("Expected public landing reset shortcut after preview.");
    }

    await act(async () => {
      previewResetLink.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/?light");
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
      devSuffix.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/?dev");

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

  it("commits the original landing dev hover target on click", async () => {
    const element = await renderSidebarMetaSection();
    const devLink = element.querySelector<HTMLAnchorElement>("#public-landing-dev-toggle");
    if (!devLink) {
      throw new Error("Expected public landing dev shortcut.");
    }

    await act(async () => {
      devLink.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(devLink.textContent).toBe("?dev");
    expect(devLink.getAttribute("aria-label")).toBe("?dev-");

    await act(async () => {
      devLink.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          button: 0,
          cancelable: true,
        }),
      );
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/?dev");
    expect(devLink.textContent).toBe("?dev");
    expect(devLink.getAttribute("aria-label")).toBe("?dev-");
  });

  it("previews and restores landing path links on hover", async () => {
    const element = await renderSidebarMetaSection();
    const termsLink = [...element.querySelectorAll<HTMLAnchorElement>("a")].find(
      (link) => link.textContent === "/terms",
    );
    if (!termsLink) {
      throw new Error("Expected terms link.");
    }

    await act(async () => {
      termsLink.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/terms");

    await act(async () => {
      termsLink.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/");
  });

  it("restores path previews after route-owned rail remounts", async () => {
    const element = await renderRouteOwnedSidebar();
    const termsLink = [...element.querySelectorAll<HTMLAnchorElement>("a")].find(
      (link) => link.textContent === "/terms",
    );
    if (!termsLink) {
      throw new Error("Expected terms link.");
    }

    await act(async () => {
      termsLink.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/terms");

    const previewTermsLink = [...element.querySelectorAll<HTMLAnchorElement>("a")].find(
      (link) => link.textContent === "/terms",
    );
    if (!previewTermsLink) {
      throw new Error("Expected preview terms link.");
    }

    await act(async () => {
      previewTermsLink.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationHref()).toBe("/home#noter");
  });

  it("previews shared right rail links outside the landing route", async () => {
    const element = await renderSidebarMetaSection("/terms");
    const privacyLink = [...element.querySelectorAll<HTMLAnchorElement>("a")].find(
      (link) => link.textContent === "/privacy",
    );
    if (!privacyLink) {
      throw new Error("Expected privacy link.");
    }

    await act(async () => {
      privacyLink.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/privacy");

    await act(async () => {
      privacyLink.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/terms");
  });

  it("leaves left rail links inert on hover", async () => {
    const element = await renderSidebarMetaSection("/terms", "left");
    const privacyLink = [...element.querySelectorAll<HTMLAnchorElement>("a")].find(
      (link) => link.textContent === "/privacy",
    );
    if (!privacyLink) {
      throw new Error("Expected privacy link.");
    }

    await act(async () => {
      privacyLink.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/terms");
  });

  it("keeps left rail handlers from consuming right rail previews", async () => {
    const element = await renderSharedSidebarMetaSections();
    const rightRail = element.querySelector('[data-testid="right-rail"]');
    const leftRail = element.querySelector('[data-testid="left-rail"]');
    const rightTermsLink = [...(rightRail?.querySelectorAll<HTMLAnchorElement>("a") ?? [])].find(
      (link) => link.textContent === "/terms",
    );
    if (!rightTermsLink || !leftRail) {
      throw new Error("Expected shared rail terms links.");
    }

    await act(async () => {
      rightTermsLink.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/terms");

    const leftTermsLink = [...leftRail.querySelectorAll<HTMLAnchorElement>("a")].find(
      (link) => link.textContent === "/terms",
    );
    if (!leftTermsLink) {
      throw new Error("Expected left rail terms link.");
    }

    await act(async () => {
      leftTermsLink.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/terms");

    const previewRightTermsLink = [
      ...(rightRail?.querySelectorAll<HTMLAnchorElement>("a") ?? []),
    ].find((link) => link.textContent === "/terms");
    if (!previewRightTermsLink) {
      throw new Error("Expected right rail terms link after preview.");
    }

    await act(async () => {
      previewRightTermsLink.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/");
  });
});
