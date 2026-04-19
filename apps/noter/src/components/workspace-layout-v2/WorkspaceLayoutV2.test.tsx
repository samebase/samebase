import type { Dispatch, SetStateAction } from "react";
import { SidebarProvider } from "@/components/sidebar";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  type WorkspaceLayoutV2Controller,
  WorkspaceLayoutV2ControlledFullPage,
  WorkspaceLayoutV2FullPage,
} from "./WorkspaceLayoutV2";

function createNoopDispatch<T>(): Dispatch<SetStateAction<T>> {
  return () => {};
}

const TEST_CONTROLLER = {
  isMobile: false,
  leftPane: {
    desktopOpen: true,
    desktopWidthPx: 280,
    mobileWidthPx: 280,
    setDesktopWidthPx: createNoopDispatch<number>(),
    setMobileWidthPx: createNoopDispatch<number>(),
  },
  mobilePane: "main",
  rightPane: {
    desktopOpen: true,
    desktopWidthPx: 320,
    mobileWidthPx: 320,
    setDesktopWidthPx: createNoopDispatch<number>(),
    setMobileWidthPx: createNoopDispatch<number>(),
  },
  setMobilePane: createNoopDispatch<"left" | "main" | "right">(),
} satisfies WorkspaceLayoutV2Controller;

describe("WorkspaceLayoutV2FullPage", () => {
  it("can render from an injected controller without sidebar context", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceLayoutV2ControlledFullPage
        controller={TEST_CONTROLLER}
        left={{
          content: <div>left pane</div>,
        }}
        main={{
          header: <div data-testid="main-header-actions">/workspace</div>,
          content: <div>main pane</div>,
        }}
        right={{
          content: <div>right pane</div>,
        }}
      />,
    );

    expect(markup).toContain('data-testid="main-header-actions"');
    expect(markup).toContain("/workspace");
    expect(markup).not.toContain("Toggle Left Sidebar");
    expect(markup).not.toContain("Toggle Right Sidebar");
  });

  it("keeps main header content rendered while sidebar toggles stay desktop-only", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <WorkspaceLayoutV2FullPage
          left={{
            content: <div>left pane</div>,
          }}
          main={{
            header: <div data-testid="main-header-actions">/machines</div>,
            content: <div>main pane</div>,
          }}
          right={{
            content: <div>right pane</div>,
          }}
        />
      </SidebarProvider>,
    );

    expect(markup).toContain('data-testid="main-header-actions"');
    expect(markup).toContain("/machines");
    expect(markup).not.toContain("hidden justify-between md:flex");
    expect((markup.match(/hidden h-8 w-8 md:inline-flex/g) ?? []).length).toBe(
      2,
    );
  });

  it("disables the shared bottom-panel close button when panel closure is blocked", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <WorkspaceLayoutV2FullPage
          left={{
            content: <div>left pane</div>,
          }}
          main={{
            header: <div>/chat</div>,
            content: <div>main pane</div>,
          }}
          panel={{
            closeDisabled: true,
            content: <div>chat panel</div>,
            header: <div>Chat</div>,
          }}
          right={{
            content: <div>right pane</div>,
          }}
        />
      </SidebarProvider>,
    );

    expect(markup).toContain('aria-label="Close bottom panel"');
    expect(markup).toContain("disabled");
  });
});
