// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { LOCAL_STORAGE_ROUTE } from "@/lib/localStorageRoute";
import { AppSidebarMetaSection } from "./AppSidebarMetaSection";

const { act } = React;

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

describe("AppSidebarMetaSection", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  beforeEach(() => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 1388);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
  });

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
    vi.unstubAllGlobals();
  });

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
  });
});
