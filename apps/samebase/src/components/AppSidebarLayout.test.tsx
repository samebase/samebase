import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { SidebarLayoutMemoryProvider } from "@samebase/sidebars/testing";
import { AppSidebarLayout } from "./AppSidebarLayout";

const TEST_SIDEBAR_WIDTH_PX = 256;
const OMIT_HEADER = Symbol("omit-header");
const TEST_ADDRESS_CHROME = <div data-testid="test-address-chrome">/test</div>;

function AppSidebarLayoutTestProvider({
  children,
  rightOpen = false,
}: {
  children: ReactNode;
  rightOpen?: boolean;
}) {
  return (
    <SidebarLayoutMemoryProvider
      initialState={{
        leftDesktopOpen: true,
        leftDesktopWidthPx: TEST_SIDEBAR_WIDTH_PX,
        leftMobileWidthPx: TEST_SIDEBAR_WIDTH_PX,
        mobilePane: "main",
        mobileSurface: { kind: "unmerged" },
        rightDesktopOpen: rightOpen,
        rightDesktopWidthPx: TEST_SIDEBAR_WIDTH_PX,
        rightMobileWidthPx: TEST_SIDEBAR_WIDTH_PX,
      }}
    >
      {children}
    </SidebarLayoutMemoryProvider>
  );
}

function renderFullPageMarkup({
  includeLeftPane = true,
  includeRightPane = true,
  mainHeader = OMIT_HEADER,
}: {
  includeLeftPane?: boolean;
  includeRightPane?: boolean;
  mainHeader?: ReactNode | typeof OMIT_HEADER;
}) {
  const mainProps =
    mainHeader === OMIT_HEADER
      ? {
          content: <div>main pane</div>,
        }
      : {
          header: mainHeader,
          content: <div>main pane</div>,
        };

  return renderToStaticMarkup(
    <AppSidebarLayoutTestProvider rightOpen>
      <AppSidebarLayout
        addressChrome={TEST_ADDRESS_CHROME}
        left={
          includeLeftPane
            ? {
                content: <div>left pane</div>,
              }
            : undefined
        }
        main={mainProps}
        right={
          includeRightPane
            ? {
                content: <div>right pane</div>,
              }
            : undefined
        }
      />
    </AppSidebarLayoutTestProvider>,
  );
}

describe("AppSidebarLayout", () => {
  it("maps app pane content into the package layout", () => {
    const markup = renderFullPageMarkup({});

    expect(markup).toContain('data-sidebar-layout-part="viewport"');
    expect(markup).toContain("left pane");
    expect(markup).toContain("main pane");
    expect(markup).toContain("right pane");
  });

  it("keeps main header content rendered while sidebar toggles stay desktop-only", () => {
    const markup = renderToStaticMarkup(
      <AppSidebarLayoutTestProvider>
        <AppSidebarLayout
          addressChrome={TEST_ADDRESS_CHROME}
          left={{
            content: <div>left pane</div>,
          }}
          main={{
            header: <div data-testid="main-header-actions">/logo</div>,
            content: <div>main pane</div>,
          }}
          right={{
            content: <div>right pane</div>,
          }}
        />
      </AppSidebarLayoutTestProvider>,
    );

    expect(markup).toContain('data-testid="main-header-actions"');
    expect(markup).toContain("/logo");
    expect(markup).toContain('data-header-visibility="all"');
    expect(markup).not.toContain("hidden justify-between md:flex");
    expect((markup.match(/hidden h-8 w-8 md:inline-flex/g) ?? []).length).toBe(2);
  });

  it("makes both pane toggles available at every viewport only when requested", () => {
    const markup = renderToStaticMarkup(
      <AppSidebarLayoutTestProvider>
        <AppSidebarLayout
          addressChrome={TEST_ADDRESS_CHROME}
          left={{ content: <div>left pane</div> }}
          leftToggleVisibility="all"
          main={{ content: <div>main pane</div> }}
          right={{ content: <div>right pane</div> }}
          rightToggleVisibility="all"
        />
      </AppSidebarLayoutTestProvider>,
    );

    expect(markup).toContain('aria-label="Toggle sidebar"');
    expect(markup).toContain('aria-label="Toggle Right Sidebar"');
    expect((markup.match(/h-8 w-8 rounded-none/g) ?? []).length).toBe(2);
    expect(markup).toContain('data-header-visibility="all"');
  });

  it("renders address chrome above the pane viewport", () => {
    const markup = renderToStaticMarkup(
      <AppSidebarLayoutTestProvider>
        <AppSidebarLayout
          addressChrome={<div data-testid="address-chrome-content">/logo</div>}
          main={{
            content: <div>main pane</div>,
          }}
        />
      </AppSidebarLayoutTestProvider>,
    );

    const addressIndex = markup.indexOf('data-sidebar-layout-part="address-chrome"');
    const viewportIndex = markup.indexOf('data-sidebar-layout-part="viewport"');

    expect(addressIndex).toBeGreaterThanOrEqual(0);
    expect(markup).toContain('data-testid="address-chrome-content"');
    expect(viewportIndex).toBeGreaterThan(addressIndex);
  });

  it("omits the right pane and right toggle when a route does not provide a right pane", () => {
    const markup = renderToStaticMarkup(
      <AppSidebarLayoutTestProvider>
        <AppSidebarLayout
          addressChrome={TEST_ADDRESS_CHROME}
          left={{
            content: <div>left pane</div>,
          }}
          main={{
            header: <div data-testid="main-header-actions">/landing</div>,
            content: <div>main pane</div>,
          }}
        />
      </AppSidebarLayoutTestProvider>,
    );

    expect(markup).toContain('aria-label="Toggle Left Sidebar"');
    expect(markup).not.toContain("right pane");
    expect(markup).not.toContain('data-pane-side="right"');
    expect(markup).not.toContain('aria-label="Toggle Right Sidebar"');
    expect((markup.match(/hidden h-8 w-8 md:inline-flex/g) ?? []).length).toBe(1);
  });

  it("omits the left pane and left toggle when a route does not provide a left pane", () => {
    const markup = renderFullPageMarkup({ includeLeftPane: false });

    expect(markup).toContain("main pane");
    expect(markup).toContain("right pane");
    expect(markup).not.toContain("left pane");
    expect(markup).not.toContain('data-pane-side="left"');
    expect(markup).not.toContain('aria-label="Toggle Left Sidebar"');
    expect(markup).toContain('aria-label="Toggle Right Sidebar"');
  });

  it("keeps the desktop header shell even when a route omits main header content", () => {
    const markup = renderFullPageMarkup({});

    expect(markup).toContain("main pane");
    expect(markup).toContain('aria-label="Toggle Left Sidebar"');
    expect(markup).toContain('aria-label="Toggle Right Sidebar"');
    expect(markup).toContain('data-sidebar-layout-part="pane-header"');
    expect(markup).toContain('data-header-visibility="desktop"');
  });

  it("can hide the left toggle and collapse an otherwise empty header row", () => {
    const markup = renderToStaticMarkup(
      <AppSidebarLayoutTestProvider>
        <AppSidebarLayout
          addressChrome={TEST_ADDRESS_CHROME}
          left={{
            content: <div>left pane</div>,
          }}
          main={{
            content: <div>main pane</div>,
          }}
          leftToggleVisibility="hidden"
        />
      </AppSidebarLayoutTestProvider>,
    );

    expect(markup).toContain("main pane");
    expect(markup).not.toContain('aria-label="Toggle Left Sidebar"');
    expect(markup).not.toContain('data-sidebar-layout-part="pane-header"');
  });

  it("can hide the right toggle and collapse an otherwise empty header row", () => {
    const markup = renderToStaticMarkup(
      <AppSidebarLayoutTestProvider rightOpen>
        <AppSidebarLayout
          addressChrome={TEST_ADDRESS_CHROME}
          left={{
            content: <div>left pane</div>,
          }}
          main={{
            content: <div>main pane</div>,
          }}
          right={{
            content: <div>right pane</div>,
          }}
          leftToggleVisibility="hidden"
          rightToggleVisibility="hidden"
        />
      </AppSidebarLayoutTestProvider>,
    );

    expect(markup).toContain("right pane");
    expect(markup).not.toContain('aria-label="Toggle Left Sidebar"');
    expect(markup).not.toContain('aria-label="Toggle Right Sidebar"');
    expect(markup).not.toContain('data-sidebar-layout-part="pane-header"');
  });

  it("treats omitted and null main headers the same outside mobile mode", () => {
    const omittedHeaderMarkup = renderFullPageMarkup({});
    const nullHeaderMarkup = renderFullPageMarkup({ mainHeader: null });

    expect(omittedHeaderMarkup).toBe(nullHeaderMarkup);
  });
});
