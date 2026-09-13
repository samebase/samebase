// @vitest-environment jsdom

import * as React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { AppSidebarMetaSection } from "./AppSidebarMetaSection";

const { act } = React;

describe("AppSidebarMetaSection", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  function unmountSidebarMetaSection() {
    if (root) {
      const mountedRoot = root;
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }

    rootElement?.remove();
    rootElement = null;
  }

  afterEach(unmountSidebarMetaSection);

  function LocationProbe() {
    const location = useLocation();

    return <output data-href={location.href} data-testid="router-location" />;
  }

  function BackLink() {
    return <Link to="/">root</Link>;
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

  async function hydrateSidebarMetaSectionFromServerMarkup({
    clientEntry,
    serverEntry,
  }: {
    clientEntry: string;
    serverEntry: string;
  }) {
    const recoverableErrors: Array<unknown> = [];
    const container = document.createElement("div");
    rootElement = container;
    container.innerHTML = renderToStaticMarkup(
      <TestRouterProvider initialEntries={[serverEntry]}>
        <AppSidebarMetaSection linkAlignment="left" />
      </TestRouterProvider>,
    );
    document.body.append(container);

    await act(async () => {
      root = hydrateRoot(
        container,
        <TestRouterProvider initialEntries={[clientEntry]}>
          <AppSidebarMetaSection linkAlignment="left" />
        </TestRouterProvider>,
        {
          onRecoverableError(error: unknown) {
            recoverableErrors.push(error);
          },
        },
      );
      await settleRouteUpdate();
    });

    return recoverableErrors;
  }

  function readLocationHref() {
    return (
      rootElement?.querySelector('[data-testid="router-location"]')?.getAttribute("data-href") ?? ""
    );
  }

  function readSidebarLinkLabels(container: ParentNode) {
    return [...container.querySelectorAll<HTMLAnchorElement>("a")].map((link) => link.textContent);
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

  it("renders only the allowed public links before and after hydration", async () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/"]}>
        <AppSidebarMetaSection linkAlignment="left" />
      </TestRouterProvider>,
    );
    const prerenderedElement = document.createElement("div");
    prerenderedElement.innerHTML = markup;

    expect(readSidebarLinkLabels(prerenderedElement)).toEqual([
      "/x.com",
      "/YouTube",
      "/terms",
      "/privacy",
      "/pricing",
      "/landing",
    ]);

    const browserElement = await renderSidebarMetaSection();

    expect(readSidebarLinkLabels(browserElement)).toEqual([
      "/x.com",
      "/YouTube",
      "/terms",
      "/privacy",
      "/pricing",
      "/landing",
    ]);
    const links = [...browserElement.querySelectorAll<HTMLAnchorElement>("a")];
    const xLink = links.find((link) => link.textContent === "/x.com");
    expect(xLink?.getAttribute("href")).toBe("https://x.com/samebasecom");
    expect(xLink?.getAttribute("class")).toBe("text-foreground");
    expect(xLink?.getAttribute("rel")).toBe("noreferrer");
    expect(xLink?.getAttribute("target")).toBe("_blank");

    const youtubeLink = links.find((link) => link.textContent === "/YouTube");
    expect(youtubeLink?.getAttribute("href")).toBe("https://www.youtube.com/@samebasecom");
    expect(youtubeLink?.getAttribute("class")).toBe("text-[#FF0000]");
    expect(youtubeLink?.getAttribute("rel")).toBe("noreferrer");
    expect(youtubeLink?.getAttribute("target")).toBe("_blank");

    expect(xLink?.parentElement).toBe(youtubeLink?.parentElement);
    expect(youtubeLink?.parentElement?.getAttribute("class")).toBe(
      "flex max-w-full flex-wrap items-center justify-start gap-3",
    );
    unmountSidebarMetaSection();

    for (const clientEntry of ["/?dev", "/?prod-ui"]) {
      const recoverableErrors = await hydrateSidebarMetaSectionFromServerMarkup({
        serverEntry: "/",
        clientEntry,
      });

      expect(recoverableErrors).toEqual([]);
      if (!rootElement) {
        throw new Error("Expected the hydrated sidebar.");
      }

      expect(readSidebarLinkLabels(rootElement)).toEqual([
        "?reset",
        "/x.com",
        "/YouTube",
        "/terms",
        "/privacy",
        "/pricing",
        "/landing",
      ]);
      unmountSidebarMetaSection();
    }

    const recoverableErrors = await hydrateSidebarMetaSectionFromServerMarkup({
      serverEntry: "/localStorage",
      clientEntry: "/localStorage?dev",
    });

    expect(recoverableErrors).toEqual([]);
    if (!rootElement) {
      throw new Error("Expected the hydrated sidebar.");
    }

    expect(readSidebarLinkLabels(rootElement)).toEqual([
      "?reset",
      "/x.com",
      "/YouTube",
      "/terms",
      "/privacy",
      "/pricing",
      "/landing",
    ]);
  });

  it("omits the landing preview path link and language shortcut", async () => {
    const element = await renderSidebarMetaSection("/landing-preview");
    const landingPreviewPathLink = [...element.querySelectorAll<HTMLAnchorElement>("a")].find(
      (link) => link.textContent === "/landing-preview",
    );
    const romanianQueryLink = element.querySelector<HTMLAnchorElement>(
      "#landing-preview-romanian-toggle",
    );

    expect(landingPreviewPathLink).toBeUndefined();
    expect(romanianQueryLink).toBeNull();
  });

  it.each([
    ["/?dev#overview", "/landing"],
    ["/terms?dev#operator", "/terms"],
    ["/privacy?dev#data", "/privacy"],
    ["/pricing?dev#plans", "/pricing"],
    ["/repo", null],
  ])("selects the current public page at %s", async (initialEntry, label) => {
    const element = await renderSidebarMetaSection(initialEntry);
    const currentLinks = [...element.querySelectorAll('a[aria-current="page"]')];

    expect(currentLinks.map((link) => link.textContent)).toEqual(label === null ? [] : [label]);
    for (const link of currentLinks) {
      expect(link.classList.contains("app-sidebar-current-label")).toBe(true);
      expect(link.classList.contains("font-semibold")).toBe(false);
    }
  });

  it("navigates path links without hover preview state", async () => {
    const element = await renderSidebarMetaSection("/", {
      extra: <BackLink />,
    });
    const termsLink = [...element.querySelectorAll<HTMLAnchorElement>("a")].find(
      (link) => link.textContent === "/terms",
    );
    const landingLink = [...element.querySelectorAll<HTMLAnchorElement>("a")].find(
      (link) => link.textContent === "/landing",
    );
    const backLink = [...element.querySelectorAll<HTMLAnchorElement>("a")].find(
      (link) => link.textContent === "root",
    );
    if (!termsLink || !landingLink || !backLink) {
      throw new Error("Expected terms, landing, and root links.");
    }

    expect(landingLink.getAttribute("href")).toBe("/");
    expect(
      [...element.querySelectorAll<HTMLAnchorElement>("a")].find(
        (link) => link.textContent === "/repo",
      ),
    ).toBeUndefined();

    await act(async () => {
      termsLink.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      await settleRouteUpdate();
    });

    expect(readLocationHref()).toBe("/");
    expect(landingLink.getAttribute("aria-current")).toBe("page");

    await clickLink(termsLink);

    expect(readLocationHref()).toBe("/terms");
    expect(termsLink.getAttribute("aria-current")).toBe("page");
    expect(landingLink.getAttribute("aria-current")).toBeNull();

    await clickLink(backLink);

    expect(readLocationHref()).toBe("/");
    expect(landingLink.getAttribute("aria-current")).toBe("page");
    expect(termsLink.getAttribute("aria-current")).toBeNull();

    await clickLink(termsLink);
    expect(readLocationHref()).toBe("/terms");

    await clickLink(landingLink);
    expect(readLocationHref()).toBe("/");
  });
});
