// @vitest-environment jsdom

import { createContext, Script } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  getDesktopSidebarWidthPx,
  type SidebarLayoutMobileMinResizeBehavior,
} from "../src/SidebarLayoutGeometryInternal.ts";
import {
  buildSidebarLayoutDesktopPrehydrationScript,
  buildSidebarLayoutMobilePanePrehydrationScript,
  clearSidebarLayoutDesktopPrehydrationStyle,
  type SidebarLayoutPrehydrationState,
} from "../src/SidebarLayoutPrehydration.ts";

const TEST_DESKTOP_STYLE_ELEMENT_ID = "sidebar-layout-prehydration";
const SECOND_DESKTOP_STYLE_ELEMENT_ID = "second-sidebar-layout-prehydration";
const DESKTOP_PREHYDRATION_SCOPE_ATTRIBUTE = "data-sidebar-layout-desktop-prehydration-scope";
const originalInnerWidthDescriptor = Object.getOwnPropertyDescriptor(window, "innerWidth");

function readDesktopPrehydrationState(): SidebarLayoutPrehydrationState {
  return {
    leftDesktopOpen: true,
    leftDesktopWidthPx: 500,
    leftMobileWidthPx: 240,
    mobilePane: "main",
    mobileSurface: { kind: "unmerged" },
    rightDesktopOpen: false,
    rightDesktopWidthPx: 600,
    rightMobileWidthPx: 240,
  };
}

function readSecondDesktopPrehydrationState(): SidebarLayoutPrehydrationState {
  return {
    leftDesktopOpen: false,
    leftDesktopWidthPx: 400,
    leftMobileWidthPx: 240,
    mobilePane: "main",
    mobileSurface: { kind: "unmerged" },
    rightDesktopOpen: true,
    rightDesktopWidthPx: 700,
    rightMobileWidthPx: 240,
  };
}

function installDesktopViewport(widthPx: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: widthPx,
  });
}

function appendDesktopPrehydrationLayout(widthPx: number) {
  const container = document.createElement("div");
  const layoutRoot = document.createElement("div");
  const carousel = document.createElement("div");
  const leftPane = document.createElement("div");
  const rightPane = document.createElement("div");
  const frameworkScriptElement = document.createElement("script");
  const scriptElement = document.createElement("script");
  carousel.setAttribute("data-sidebar-layout-part", "carousel");
  leftPane.setAttribute("data-pane-side", "left");
  leftPane.setAttribute("data-sidebar-layout-part", "pane");
  rightPane.setAttribute("data-desktop-open", "");
  rightPane.setAttribute("data-pane-side", "right");
  rightPane.setAttribute("data-sidebar-layout-part", "pane");
  carousel.append(leftPane, rightPane);
  layoutRoot.append(carousel);
  container.append(layoutRoot, frameworkScriptElement, scriptElement);
  document.body.append(container);
  vi.spyOn(carousel, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, widthPx, 800));

  return { carousel, scriptElement };
}

function readMergedMobilePrehydrationState(): SidebarLayoutPrehydrationState {
  return {
    leftDesktopOpen: true,
    leftDesktopWidthPx: 240,
    leftMobileWidthPx: 260,
    mobilePane: "right",
    mobileSurface: { kind: "merged", mainWidthPx: 260, side: "right" },
    rightDesktopOpen: true,
    rightDesktopWidthPx: 240,
    rightMobileWidthPx: 130,
  };
}

function appendMobilePrehydrationLayout(
  mobileMinResizeBehavior: SidebarLayoutMobileMinResizeBehavior,
) {
  const container = document.createElement("div");
  const layoutRoot = document.createElement("div");
  const carousel = document.createElement("div");
  const leftPane = document.createElement("div");
  const mainPane = document.createElement("div");
  const rightPane = document.createElement("div");
  const scriptElement = document.createElement("script");
  layoutRoot.setAttribute("data-mobile-min-resize-behavior", mobileMinResizeBehavior);
  layoutRoot.setAttribute("data-sidebar-layout-part", "viewport");
  carousel.setAttribute("data-sidebar-layout-part", "carousel");
  leftPane.setAttribute("data-pane-side", "left");
  leftPane.setAttribute("data-sidebar-layout-part", "pane");
  mainPane.setAttribute("data-pane-side", "main");
  mainPane.setAttribute("data-sidebar-layout-part", "pane");
  rightPane.setAttribute("data-pane-side", "right");
  rightPane.setAttribute("data-sidebar-layout-part", "pane");
  carousel.append(leftPane, mainPane, rightPane);
  layoutRoot.append(carousel);
  container.append(layoutRoot, scriptElement);
  document.body.append(container);
  vi.spyOn(carousel, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 390, 800));

  return { carousel, layoutRoot, scriptElement };
}

function runDesktopPrehydrationScript({
  readState = readDesktopPrehydrationState,
  scriptElement,
  styleElementId = TEST_DESKTOP_STYLE_ELEMENT_ID,
}: {
  readState?: () => SidebarLayoutPrehydrationState;
  scriptElement: HTMLScriptElement;
  styleElementId?: string;
}) {
  const script = buildSidebarLayoutDesktopPrehydrationScript(
    { desktopStyleElementId: styleElementId },
    readState,
  );
  const currentScriptSpy = vi
    .spyOn(document, "currentScript", "get")
    .mockReturnValue(scriptElement);

  try {
    new Script(script).runInContext(
      createContext({
        document,
        encodeURIComponent,
        Math,
        Number,
        window,
      }),
    );
  } finally {
    currentScriptSpy.mockRestore();
  }
}

function runMobilePrehydrationScript(scriptElement: HTMLScriptElement) {
  const script = buildSidebarLayoutMobilePanePrehydrationScript(
    { desktopStyleElementId: TEST_DESKTOP_STYLE_ELEMENT_ID },
    readMergedMobilePrehydrationState,
  );
  const currentScriptSpy = vi
    .spyOn(document, "currentScript", "get")
    .mockReturnValue(scriptElement);

  try {
    new Script(script).runInContext(
      createContext({
        document,
        JSON,
        Math,
        Number,
        window,
      }),
    );
  } finally {
    currentScriptSpy.mockRestore();
  }
}

function getDesktopViewportSelector(carousel: HTMLElement) {
  const scopeValue = carousel.getAttribute(DESKTOP_PREHYDRATION_SCOPE_ATTRIBUTE);
  if (scopeValue === null) {
    throw new Error("Expected the desktop prehydration scope.");
  }

  return `[data-sidebar-layout-part="carousel"][${DESKTOP_PREHYDRATION_SCOPE_ATTRIBUTE}="${scopeValue}"]:not([data-viewport-measured])`;
}

function getRequiredDesktopStyleRule(styleElementId: string, selector: string) {
  const styleElement = document.getElementById(styleElementId);
  if (!(styleElement instanceof HTMLStyleElement) || styleElement.sheet === null) {
    throw new Error("Expected the desktop prehydration stylesheet.");
  }

  for (const rule of Array.from(styleElement.sheet.cssRules)) {
    if (!(rule instanceof CSSMediaRule)) continue;

    for (const nestedRule of Array.from(rule.cssRules)) {
      if (nestedRule instanceof CSSStyleRule && nestedRule.selectorText === selector) {
        return nestedRule;
      }
    }
  }

  throw new Error(`Expected the desktop prehydration rule: ${selector}`);
}

describe("sidebar layout prehydration", () => {
  afterEach(() => {
    clearSidebarLayoutDesktopPrehydrationStyle({
      desktopStyleElementId: TEST_DESKTOP_STYLE_ELEMENT_ID,
    });
    clearSidebarLayoutDesktopPrehydrationStyle({
      desktopStyleElementId: SECOND_DESKTOP_STYLE_ELEMENT_ID,
    });
    document.body.replaceChildren();
    vi.restoreAllMocks();
    if (originalInnerWidthDescriptor !== undefined) {
      Object.defineProperty(window, "innerWidth", originalInnerWidthDescriptor);
    }
  });

  it("uses package part attributes instead of test selectors", () => {
    const script = buildSidebarLayoutMobilePanePrehydrationScript(
      {
        desktopStyleElementId: "sidebar-layout-prehydration",
      },
      () => null,
    );

    expect(script).toContain("data-sidebar-layout-part");
    expect(script).toContain("data-pane-side");
    expect(script).not.toContain("data-testid");
  });

  it("leaves storage and border colors to the consumer", () => {
    const args = { desktopStyleElementId: "sidebar-layout-prehydration" };
    const scripts = [
      buildSidebarLayoutDesktopPrehydrationScript(args, () => null),
      buildSidebarLayoutMobilePanePrehydrationScript(args, () => null),
    ];

    for (const script of scripts) {
      expect(script).not.toContain("localStorage");
      expect(script).not.toContain("storageKey");
      expect(script).not.toContain("storageVersion");
      expect(script).not.toContain("border-color");
      expect(script).not.toContain("border-left-width");
      expect(script).not.toContain("border-right-width");
    }
    expect(scripts[0]).toContain("border-inline-end-width");
    expect(scripts[0]).toContain("border-inline-start-width");
  });

  it("prehydrates a saved merge as unmerged when the viewport uses slide behavior", () => {
    installDesktopViewport(390);
    const { carousel, layoutRoot, scriptElement } =
      appendMobilePrehydrationLayout("min_resize_to_slide");

    runMobilePrehydrationScript(scriptElement);

    expect(layoutRoot.getAttribute("data-mobile-pane")).toBe("right");
    expect(layoutRoot.hasAttribute("data-sidebar-layout-mobile-merged-side")).toBe(false);
    expect(layoutRoot.style.getPropertyValue("--sidebar-layout-main-mobile-width")).toBe("390px");
    expect(carousel.scrollLeft).toBe(390);
  });

  it("uses the 600px layout width in a 1200px window", () => {
    const windowWidthPx = 1200;
    const layoutWidthPx = 600;
    installDesktopViewport(windowWidthPx);
    const { carousel, scriptElement } = appendDesktopPrehydrationLayout(layoutWidthPx);

    runDesktopPrehydrationScript({ scriptElement });

    const viewportSelector = getDesktopViewportSelector(carousel);
    const leftPaneRule = getRequiredDesktopStyleRule(
      TEST_DESKTOP_STYLE_ELEMENT_ID,
      `${viewportSelector} [data-sidebar-layout-part="pane"][data-pane-side="left"]`,
    );
    expect(leftPaneRule.style.width).toBe(
      `${getDesktopSidebarWidthPx({
        isOpen: true,
        storedWidthPx: 500,
        viewportWidthPx: layoutWidthPx,
      })}px`,
    );
    expect(leftPaneRule.style.getPropertyPriority("width")).toBe("important");
  });

  it("overrides separator width when stored state differs from server markup", () => {
    installDesktopViewport(800);
    const { carousel, scriptElement } = appendDesktopPrehydrationLayout(800);

    runDesktopPrehydrationScript({ scriptElement });

    const viewportSelector = getDesktopViewportSelector(carousel);
    const leftPaneRule = getRequiredDesktopStyleRule(
      TEST_DESKTOP_STYLE_ELEMENT_ID,
      `${viewportSelector} [data-sidebar-layout-part="pane"][data-pane-side="left"]`,
    );
    const rightPaneRule = getRequiredDesktopStyleRule(
      TEST_DESKTOP_STYLE_ELEMENT_ID,
      `${viewportSelector} [data-sidebar-layout-part="pane"][data-pane-side="right"]`,
    );
    expect(leftPaneRule.style.getPropertyValue("border-inline-end-width")).toBe("1px");
    expect(leftPaneRule.style.getPropertyPriority("border-inline-end-width")).toBe("important");
    expect(rightPaneRule.style.getPropertyValue("border-inline-start-width")).toBe("0px");
    expect(rightPaneRule.style.getPropertyPriority("border-inline-start-width")).toBe("important");
  });

  it("scopes different stored states to two layout instances", () => {
    installDesktopViewport(1200);
    const firstLayout = appendDesktopPrehydrationLayout(600);
    const secondLayout = appendDesktopPrehydrationLayout(800);

    runDesktopPrehydrationScript({ scriptElement: firstLayout.scriptElement });
    runDesktopPrehydrationScript({
      readState: readSecondDesktopPrehydrationState,
      scriptElement: secondLayout.scriptElement,
      styleElementId: SECOND_DESKTOP_STYLE_ELEMENT_ID,
    });

    const firstViewportSelector = getDesktopViewportSelector(firstLayout.carousel);
    const secondViewportSelector = getDesktopViewportSelector(secondLayout.carousel);
    expect(firstViewportSelector).not.toBe(secondViewportSelector);
    expect(firstLayout.carousel.matches(firstViewportSelector)).toBe(true);
    expect(firstLayout.carousel.matches(secondViewportSelector)).toBe(false);
    expect(secondLayout.carousel.matches(firstViewportSelector)).toBe(false);
    expect(secondLayout.carousel.matches(secondViewportSelector)).toBe(true);

    const firstLeftPaneRule = getRequiredDesktopStyleRule(
      TEST_DESKTOP_STYLE_ELEMENT_ID,
      `${firstViewportSelector} [data-sidebar-layout-part="pane"][data-pane-side="left"]`,
    );
    const firstRightPaneRule = getRequiredDesktopStyleRule(
      TEST_DESKTOP_STYLE_ELEMENT_ID,
      `${firstViewportSelector} [data-sidebar-layout-part="pane"][data-pane-side="right"]`,
    );
    const secondLeftPaneRule = getRequiredDesktopStyleRule(
      SECOND_DESKTOP_STYLE_ELEMENT_ID,
      `${secondViewportSelector} [data-sidebar-layout-part="pane"][data-pane-side="left"]`,
    );
    const secondRightPaneRule = getRequiredDesktopStyleRule(
      SECOND_DESKTOP_STYLE_ELEMENT_ID,
      `${secondViewportSelector} [data-sidebar-layout-part="pane"][data-pane-side="right"]`,
    );
    expect(firstLeftPaneRule.style.width).toBe("270px");
    expect(firstRightPaneRule.style.width).toBe("0px");
    expect(secondLeftPaneRule.style.width).toBe("0px");
    expect(secondRightPaneRule.style.width).toBe("360px");
  });
});
