// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { registerPageLeaveGuard, usePageLeaveGuard } from "./pageLeaveGuard";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

function dispatchBeforeUnload() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

function PageLeaveGuardProbe({ enabled }: { enabled: boolean }) {
  usePageLeaveGuard({
    enabled,
    reason: "test guard",
  });

  return null;
}

describe("page leave guard", () => {
  let root: Root | null = null;

  afterEach(() => {
    const mountedRoot = root;
    if (mountedRoot !== null) {
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }

    document.body.replaceChildren();
  });

  function renderGuard(enabled: boolean) {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    const render = (nextEnabled: boolean) => {
      act(() => {
        localRoot.render(<PageLeaveGuardProbe enabled={nextEnabled} />);
      });
    };

    render(enabled);

    return { rerender: render };
  }

  it("blocks page leave only while a hook guard is active", () => {
    const renderedGuard = renderGuard(false);

    expect(dispatchBeforeUnload()).toBe(false);

    renderedGuard.rerender(true);
    expect(dispatchBeforeUnload()).toBe(true);

    renderedGuard.rerender(false);
    expect(dispatchBeforeUnload()).toBe(false);
  });

  it("keeps the beforeunload guard active until every direct registration is released", () => {
    const releaseFirstGuard = registerPageLeaveGuard("first");
    const releaseSecondGuard = registerPageLeaveGuard("second");

    expect(dispatchBeforeUnload()).toBe(true);

    releaseFirstGuard();
    expect(dispatchBeforeUnload()).toBe(true);

    releaseSecondGuard();
    expect(dispatchBeforeUnload()).toBe(false);
  });
});
