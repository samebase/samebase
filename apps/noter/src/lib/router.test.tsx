// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  Link,
  MemoryRouter,
  useLocation,
  useNavigate,
  useSearchParams,
} from "./router";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

function RouterHarness() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  return (
    <div>
      <div data-testid="location">{`${location.pathname}${location.search}`}</div>
      <div data-testid="state">{JSON.stringify(location.state)}</div>
      <div data-testid="tab">{searchParams.get("tab") ?? ""}</div>
      <button
        type="button"
        data-testid="set-search"
        onClick={() => {
          setSearchParams("tab=beta", { replace: true });
        }}
      >
        Set search
      </button>
      <button
        type="button"
        data-testid="navigate-button"
        onClick={() => {
          navigate("/pricing?plan=free", {
            state: { source: "button" },
          });
        }}
      >
        Navigate
      </button>
      <Link
        data-testid="link"
        to="/machines?machineId=router-compat"
        state={{ source: "link" }}
      >
        Machines
      </Link>
    </div>
  );
}

describe("router compatibility seam", () => {
  let rootElement: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    if (root !== null) {
      const mountedRoot = root;
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }

    rootElement?.remove();
    rootElement = null;
  });

  it("keeps React Router-like location, search, and link behavior", () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={["/vault/noter-md/noter/main?tab=alpha"]}>
          <RouterHarness />
        </MemoryRouter>,
      );
    });

    const location = rootElement.querySelector('[data-testid="location"]');
    const state = rootElement.querySelector('[data-testid="state"]');
    const tab = rootElement.querySelector('[data-testid="tab"]');
    const setSearchButton = rootElement.querySelector(
      '[data-testid="set-search"]',
    );
    const navigateButton = rootElement.querySelector(
      '[data-testid="navigate-button"]',
    );
    const link = rootElement.querySelector('[data-testid="link"]');

    expect(location?.textContent).toBe("/vault/noter-md/noter/main?tab=alpha");
    expect(state?.textContent).toBe("null");
    expect(tab?.textContent).toBe("alpha");
    expect(setSearchButton).toBeInstanceOf(HTMLButtonElement);
    expect(navigateButton).toBeInstanceOf(HTMLButtonElement);
    expect(link).toBeInstanceOf(HTMLAnchorElement);

    if (
      !(setSearchButton instanceof HTMLButtonElement) ||
      !(navigateButton instanceof HTMLButtonElement) ||
      !(link instanceof HTMLAnchorElement)
    ) {
      throw new Error("Expected router harness controls");
    }

    act(() => {
      setSearchButton.click();
    });

    expect(location?.textContent).toBe("/vault/noter-md/noter/main?tab=beta");
    expect(tab?.textContent).toBe("beta");

    act(() => {
      navigateButton.click();
    });

    expect(location?.textContent).toBe("/pricing?plan=free");
    expect(state?.textContent).toBe('{"source":"button"}');

    act(() => {
      link.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          button: 0,
          cancelable: true,
        }),
      );
    });

    expect(location?.textContent).toBe("/machines?machineId=router-compat");
    expect(state?.textContent).toBe('{"source":"link"}');
  });
});
