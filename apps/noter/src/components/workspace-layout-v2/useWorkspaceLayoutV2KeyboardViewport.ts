import { useEffect, useEffectEvent, useState, type RefObject } from "react";

const MOBILE_KEYBOARD_MIN_INSET_PX = 120;
const KEYBOARD_TARGET_MARGIN_PX = 12;

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

type WorkspaceLayoutV2KeyboardViewportState = {
  keyboardInsetPx: number;
  visibleHeightPx: number;
};

function isTextInputElement(element: HTMLInputElement) {
  return !element.disabled && !element.readOnly && !NON_TEXT_INPUT_TYPES.has(element.type);
}

function isKeyboardEditableElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.isContentEditable) {
    return true;
  }

  if (element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }

  if (element instanceof HTMLInputElement) {
    return isTextInputElement(element);
  }

  // Chrome Android exposes CodeMirror's active NativeEditContext as a focused
  // role=textbox div rather than the underlying contenteditable surface.
  return element.getAttribute("role") === "textbox";
}

function isScrollableOverflowY(overflowY: string) {
  return overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
}

function findVerticalScrollContainer(args: { target: HTMLElement; viewportNode: HTMLElement }) {
  let node = args.target.parentElement;

  while (node !== null && node !== args.viewportNode) {
    const style = window.getComputedStyle(node);
    if (isScrollableOverflowY(style.overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }

    node = node.parentElement;
  }

  return null;
}

function scrollKeyboardTargetIntoView(args: {
  target: HTMLElement;
  viewportNode: HTMLElement;
  visibleHeightPx: number;
}) {
  const scrollContainer = findVerticalScrollContainer(args);
  if (scrollContainer === null) {
    return;
  }

  const targetBounds = args.target.getBoundingClientRect();
  const viewportBounds = args.viewportNode.getBoundingClientRect();
  const visualViewportTopPx = window.visualViewport?.offsetTop ?? 0;
  const visibleTopPx = Math.max(viewportBounds.top, visualViewportTopPx);
  const visibleBottomPx = visibleTopPx + args.visibleHeightPx;
  const bottomOverflowPx = targetBounds.bottom + KEYBOARD_TARGET_MARGIN_PX - visibleBottomPx;
  if (bottomOverflowPx > 0) {
    scrollContainer.scrollTop += bottomOverflowPx;
    return;
  }

  const topOverflowPx = visibleTopPx - (targetBounds.top - KEYBOARD_TARGET_MARGIN_PX);
  if (topOverflowPx > 0) {
    scrollContainer.scrollTop -= topOverflowPx;
  }
}

function getWorkspaceKeyboardViewportState(args: {
  activeElement: Element | null;
  isMobile: boolean;
  viewportNode: HTMLElement | null;
  visualViewport: Pick<VisualViewport, "height" | "offsetTop"> | null;
  windowInnerHeightPx: number;
}): WorkspaceLayoutV2KeyboardViewportState | null {
  const { activeElement, isMobile, viewportNode, visualViewport } = args;
  if (
    !isMobile ||
    viewportNode === null ||
    visualViewport === null ||
    !isKeyboardEditableElement(activeElement) ||
    !viewportNode.contains(activeElement)
  ) {
    return null;
  }

  const keyboardInsetPx = Math.round(
    Math.max(0, args.windowInnerHeightPx - visualViewport.height - visualViewport.offsetTop),
  );
  if (keyboardInsetPx < MOBILE_KEYBOARD_MIN_INSET_PX) {
    return null;
  }

  const viewportBounds = viewportNode.getBoundingClientRect();
  const viewportTopInsetPx = Math.max(0, viewportBounds.top - visualViewport.offsetTop);
  const visibleHeightPx = Math.round(Math.max(0, visualViewport.height - viewportTopInsetPx));
  if (visibleHeightPx <= 0) {
    return null;
  }

  return {
    keyboardInsetPx,
    visibleHeightPx,
  };
}

/**
 * Android and iOS keyboards shrink the visual viewport while flex layout can
 * keep the workspace at the old full-height box. Clamp only the inner
 * workspace viewport so the app shell and mobile carousel keep their current
 * ownership.
 */
export function useWorkspaceLayoutV2KeyboardViewport(args: {
  isMobile: boolean;
  viewportRef: RefObject<HTMLDivElement | null>;
}) {
  const [keyboardViewportState, setKeyboardViewportState] =
    useState<WorkspaceLayoutV2KeyboardViewportState | null>(null);

  const syncKeyboardViewportState = useEffectEvent(() => {
    setKeyboardViewportState((currentState) => {
      const nextState = getWorkspaceKeyboardViewportState({
        activeElement: document.activeElement,
        isMobile: args.isMobile,
        viewportNode: args.viewportRef.current,
        visualViewport: window.visualViewport,
        windowInnerHeightPx: window.innerHeight,
      });

      if (
        currentState?.keyboardInsetPx === nextState?.keyboardInsetPx &&
        currentState?.visibleHeightPx === nextState?.visibleHeightPx
      ) {
        return currentState;
      }

      return nextState;
    });
  });

  useEffect(() => {
    if (!args.isMobile) {
      setKeyboardViewportState(null);
      return;
    }

    const visualViewport = window.visualViewport;
    if (!visualViewport) {
      return;
    }

    let frameId = 0;
    const scheduleSync = () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        syncKeyboardViewportState();
      });
    };

    scheduleSync();
    visualViewport.addEventListener("resize", scheduleSync);
    visualViewport.addEventListener("scroll", scheduleSync);
    window.addEventListener("focusin", scheduleSync, true);
    window.addEventListener("focusout", scheduleSync, true);
    window.addEventListener("resize", scheduleSync);

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      visualViewport.removeEventListener("resize", scheduleSync);
      visualViewport.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("focusin", scheduleSync, true);
      window.removeEventListener("focusout", scheduleSync, true);
      window.removeEventListener("resize", scheduleSync);
    };
  }, [args.isMobile, args.viewportRef]);

  useEffect(() => {
    if (keyboardViewportState === null) {
      return;
    }

    const activeElement = document.activeElement;
    const viewportNode = args.viewportRef.current;
    if (
      !isKeyboardEditableElement(activeElement) ||
      viewportNode === null ||
      !viewportNode.contains(activeElement)
    ) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      scrollKeyboardTargetIntoView({
        target: activeElement,
        viewportNode,
        visibleHeightPx: keyboardViewportState.visibleHeightPx,
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [args.viewportRef, keyboardViewportState]);

  return keyboardViewportState;
}
