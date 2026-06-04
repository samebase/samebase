// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { useLocation, useRouter } from "@tanstack/react-router";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { LOCAL_STORAGE_ROUTE } from "@/lib/localStorageRoute";
import { RoutePreviewProvider } from "@/components/RoutePreviewController";
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

  function BackButton() {
    const router = useRouter();

    return (
      <button
        type="button"
        data-testid="router-back"
        onClick={() => {
          router.history.back();
        }}
      >
        back
      </button>
    );
  }

  function NavigatePrivacyButton() {
    const router = useRouter();

    return (
      <button
        type="button"
        data-testid="navigate-privacy"
        onClick={() => {
          void router.navigate({ to: "/privacy" });
        }}
      >
        privacy
      </button>
    );
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
          <RoutePreviewProvider>
            <AppSidebarMetaSection linkAlignment={linkAlignment} />
            {extra}
            <LocationProbe />
          </RoutePreviewProvider>
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
          <AppSidebarMetaSection key={pathname} linkAlignment="left" />
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
          <RoutePreviewProvider>
            <RouteOwnedSidebarHarness />
          </RoutePreviewProvider>
        </TestRouterProvider>,
      );
      await settleRouteUpdate();
    });

    return element;
  }

  it("omits hidden dev shortcuts from prerendered markup", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/"]}>
        <RoutePreviewProvider>
          <AppSidebarMetaSection linkAlignment="left" />
        </RoutePreviewProvider>
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
          <RoutePreviewProvider>
            <AppSidebarMetaSection linkAlignment="left" />
          </RoutePreviewProvider>
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

  it("previews landing query shortcuts without retargeting the hovered link", async () => {
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
    expect(devLink.getAttribute("aria-label")).toBe("?dev");
    expect(rootElement?.querySelector("#public-landing-search-reset")).toBeNull();

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
    expect(devLink.getAttribute("aria-label")).toBe("?dev");

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

  it("commits a hover preview as a new history entry", async () => {
    const element = await renderSidebarMetaSection("/", {
      extra: <BackButton />,
    });
    const termsLink = [...element.querySelectorAll<HTMLAnchorElement>("a")].find(
      (link) => link.textContent === "/terms",
    );
    const backButton = element.querySelector<HTMLButtonElement>('[data-testid="router-back"]');
    if (!termsLink || !backButton) {
      throw new Error("Expected terms link and back button.");
    }

    await act(async () => {
      termsLink.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/terms");

    await act(async () => {
      termsLink.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          button: 0,
          cancelable: true,
        }),
      );
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/terms");

    await act(async () => {
      backButton.click();
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/");
  });

  it("ignores a stale preview restore after unrelated navigation", async () => {
    const element = await renderSidebarMetaSection("/", {
      extra: <NavigatePrivacyButton />,
    });
    const termsLink = [...element.querySelectorAll<HTMLAnchorElement>("a")].find(
      (link) => link.textContent === "/terms",
    );
    const privacyButton = element.querySelector<HTMLButtonElement>(
      '[data-testid="navigate-privacy"]',
    );
    if (!termsLink || !privacyButton) {
      throw new Error("Expected terms link and privacy navigation button.");
    }

    await act(async () => {
      termsLink.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/terms");

    await act(async () => {
      privacyButton.click();
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/privacy");

    await act(async () => {
      termsLink.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationText()).toBe("/privacy");
  });

  it("toggles an active theme shortcut without requiring a fresh hover preview", async () => {
    const element = await renderSidebarMetaSection("/?dev&dark");
    const darkLink = element.querySelector<HTMLAnchorElement>("#public-landing-theme-dark-toggle");
    if (!darkLink) {
      throw new Error("Expected public landing dark shortcut.");
    }

    await act(async () => {
      darkLink.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          button: 0,
          cancelable: true,
        }),
      );
      await settleRouteUpdate();
    });

    expect(readLocationHref()).toBe("/?dev");
    expect(darkLink.textContent).toBe("?dark");
    expect(darkLink.getAttribute("aria-label")).toBe("?dark");
  });

  it("keeps query preview targets stable when the previewed toggle re-enters", async () => {
    const element = await renderSidebarMetaSection("/?dev&light");
    const darkLink = element.querySelector<HTMLAnchorElement>("#public-landing-theme-dark-toggle");
    if (!darkLink) {
      throw new Error("Expected public landing dark shortcut.");
    }

    await act(async () => {
      darkLink.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationHref()).toBe("/?dev&dark");

    const previewDarkLink = element.querySelector<HTMLAnchorElement>(
      "#public-landing-theme-dark-toggle",
    );
    if (!previewDarkLink) {
      throw new Error("Expected public landing dark shortcut after preview.");
    }

    await act(async () => {
      previewDarkLink.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationHref()).toBe("/?dev&dark");

    await act(async () => {
      previewDarkLink.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          button: 0,
          cancelable: true,
        }),
      );
      await settleRouteUpdate();
    });

    expect(readLocationHref()).toBe("/?dev&dark");
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

  it("restores when the pointer leaves before the preview navigation settles", async () => {
    const element = await renderSidebarMetaSection();
    const termsLink = [...element.querySelectorAll<HTMLAnchorElement>("a")].find(
      (link) => link.textContent === "/terms",
    );
    if (!termsLink) {
      throw new Error("Expected terms link.");
    }

    await act(async () => {
      termsLink.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
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

  it("previews footer links outside the landing route", async () => {
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

  it("previews right-aligned footer links on hover", async () => {
    const element = await renderSidebarMetaSection("/terms", {
      linkAlignment: "right",
    });
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
});
