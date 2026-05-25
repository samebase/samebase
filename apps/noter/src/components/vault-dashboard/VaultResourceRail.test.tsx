// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { VaultResourceRail, type VaultResourceRailState } from "./VaultResourceRail";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

type VaultResourceRailGithubRow = VaultResourceRailState["githubRow"];
type VaultResourceRailAppRow = VaultResourceRailState["apps"][number]["rows"][number];

let rootElement: HTMLDivElement | null = null;
let root: Root | null = null;

function buildRootResourceRailState({
  appRows,
  githubRow,
}: {
  appRows: readonly VaultResourceRailAppRow[];
  githubRow: VaultResourceRailGithubRow;
}): VaultResourceRailState {
  return {
    githubRow,
    apps: [{ appRoot: ".", rows: appRows }],
  };
}

function renderInteractiveRail(state: VaultResourceRailState): HTMLDivElement {
  rootElement = document.createElement("div");
  document.body.append(rootElement);
  root = createRoot(rootElement);

  act(() => {
    root?.render(<VaultResourceRail state={state} />);
  });

  return rootElement;
}

describe("VaultResourceRail", () => {
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

  it("renders explicit provider resource states and scoped links", () => {
    const state = buildRootResourceRailState({
      githubRow: {
        provider: "github",
        status: "ready",
        value: "nicu-chiciuc/weight_tsx",
        href: "https://github.com/nicu-chiciuc/weight_tsx",
      },
      appRows: [
        {
          provider: "convex",
          status: "ready",
          scope: "nicu",
          value: "weight-tsx",
          href: "https://dashboard.convex.dev/t/nicu/weight-tsx/settings",
        },
        {
          provider: "cloudflare",
          status: "ready",
          scope: "nicuchiciuc",
          value: "weight-tsx",
          href: "https://dash.cloudflare.com/?to=/account/workers/services/view/weight-tsx/production/deployments",
        },
      ],
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);

    expect(markup).toContain("nicu-chiciuc/weight_tsx");
    expect(markup).toContain("nicu/");
    expect(markup).toContain("nicuchiciuc/");
    expect(markup).not.toContain("Not connected");
    expect(markup).toContain("Open Convex: nicu/weight-tsx");
    expect(markup).toContain("Open Cloudflare: nicuchiciuc/weight-tsx");
    expect(markup).not.toContain('target="_blank"');
    expect(markup).not.toContain("Connected existing");
  });

  it("keeps setup status copy out of the resource rail", () => {
    const state = buildRootResourceRailState({
      githubRow: {
        provider: "github",
        status: "ready",
        value: "nicu-chiciuc/weight_tsx",
        href: "https://github.com/nicu-chiciuc/weight_tsx",
      },
      appRows: [
        {
          provider: "convex",
          status: "running",
          value: "weight-tsx",
        },
        {
          provider: "cloudflare",
          status: "failed",
          value: "weight-tsx",
          actions: [
            {
              kind: "retry",
              label: "Retry",
            },
          ],
        },
      ],
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);

    expect(markup).toContain("Open GitHub");
    expect(markup).not.toContain("Creating Convex project.");
    expect(markup).not.toContain("Multiple Cloudflare accounts are available.");
    expect(markup).toContain("Retry");
  });

  it("keeps unwired actions disabled", () => {
    const state = buildRootResourceRailState({
      githubRow: {
        provider: "github",
        status: "ready",
        value: "nicu-chiciuc/weight_tsx",
        href: "https://github.com/nicu-chiciuc/weight_tsx",
      },
      appRows: [
        {
          provider: "convex",
          status: "action_required",
          actions: [
            {
              kind: "add",
              label: "Add",
            },
          ],
        },
        {
          provider: "cloudflare",
          status: "pending",
          value: "weight-tsx",
        },
      ],
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);

    expect(markup).toMatch(
      /disabled=""[^>]*aria-label="Add Convex"|aria-label="Add Convex"[^>]*disabled=""/,
    );
  });

  it("renders provider add actions as standard query links", () => {
    const state = buildRootResourceRailState({
      githubRow: {
        provider: "github",
        status: "ready",
        value: "nicu-chiciuc/weight_tsx",
        href: "https://github.com/nicu-chiciuc/weight_tsx",
      },
      appRows: [
        {
          provider: "convex",
          status: "action_required",
          actions: [
            {
              kind: "add",
              label: "?add-convex",
              href: "/home?add-convex#weight_tsx",
            },
          ],
        },
        {
          provider: "cloudflare",
          status: "action_required",
          actions: [
            {
              kind: "add",
              label: "?add-cloudflare",
              href: "/home?add-cloudflare#weight_tsx",
            },
          ],
        },
      ],
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);

    expect(markup).toContain("?add-convex");
    expect(markup).toContain("?add-cloudflare");
    expect(markup).toContain('aria-label="Add Convex"');
    expect(markup).toContain('aria-label="Add Cloudflare"');
    expect(markup).not.toContain("text-blue-600");
  });

  it("renders ready provider add actions next to the resource link", () => {
    const state = buildRootResourceRailState({
      githubRow: {
        provider: "github",
        status: "ready",
        value: "nicu-chiciuc/weight_tsx",
        href: "https://github.com/nicu-chiciuc/weight_tsx",
      },
      appRows: [
        {
          provider: "convex",
          status: "ready",
          value: "weight-tsx",
          href: "https://dashboard.convex.dev/t/nicu/weight-tsx/settings",
        },
        {
          provider: "cloudflare",
          status: "ready",
          scope: "nicuchiciuc",
          value: "weight-tsx",
          href: "https://dash.cloudflare.com/?to=/account/workers/services/view/weight-tsx/production/deployments",
          actions: [
            {
              kind: "add",
              label: "?add-cloudflare",
              href: "/home?add-cloudflare#weight_tsx",
            },
          ],
        },
      ],
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);

    expect(markup).toContain("Open Cloudflare: nicuchiciuc/weight-tsx");
    expect(markup).toContain('href="/home?add-cloudflare#weight_tsx"');
    expect(markup).toContain('aria-label="Add Cloudflare"');
    expect(markup).not.toContain('target="_blank"');
  });

  it("uses router callbacks for href action clicks when available", () => {
    const onClick = vi.fn();
    const state = buildRootResourceRailState({
      githubRow: {
        provider: "github",
        status: "ready",
        value: "nicu-chiciuc/weight_tsx",
        href: "https://github.com/nicu-chiciuc/weight_tsx",
      },
      appRows: [
        {
          provider: "convex",
          status: "action_required",
          actions: [
            {
              kind: "add",
              label: "?add-convex",
              href: "/home?add-convex&app-root=apps%2Fnoter#weight_tsx",
              onClick,
            },
          ],
        },
      ],
    });
    const container = renderInteractiveRail(state);
    const link = container.querySelector('a[aria-label="Add Convex"]');
    expect(link instanceof HTMLAnchorElement).toBe(true);
    if (!(link instanceof HTMLAnchorElement)) {
      throw new Error("Expected add action link");
    }
    expect(link.getAttribute("href")).toBe("/home?add-convex&app-root=apps%2Fnoter#weight_tsx");

    const click = new MouseEvent("click", {
      bubbles: true,
      button: 0,
      cancelable: true,
    });
    let defaultPreventedBeforeNativeNavigation: boolean | null = null;
    window.addEventListener(
      "click",
      (event) => {
        defaultPreventedBeforeNativeNavigation = event.defaultPrevented;
        event.preventDefault();
      },
      { once: true },
    );

    act(() => {
      link.dispatchEvent(click);
    });

    expect(defaultPreventedBeforeNativeNavigation).toBe(true);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("keeps root providers top-level and groups subfolder providers under app roots", () => {
    const state = {
      githubRow: {
        provider: "github",
        status: "ready",
        value: "nicu-chiciuc/weight_tsx",
        href: "https://github.com/nicu-chiciuc/weight_tsx",
      },
      apps: [
        {
          appRoot: ".",
          rows: [
            {
              provider: "convex",
              status: "action_required",
              actions: [
                {
                  kind: "add",
                  label: "?add-convex",
                  href: "/home?add-convex#weight_tsx",
                },
              ],
            },
            {
              provider: "cloudflare",
              status: "ready",
              value: "worker-root",
            },
          ],
        },
        {
          appRoot: "apps/api",
          rows: [
            {
              provider: "cloudflare",
              status: "ready",
              value: "worker-api",
            },
          ],
        },
      ],
    } satisfies VaultResourceRailState;

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);

    expect(markup).toContain("apps/api");
    expect(markup).toContain("lucide-chevron-down");
    expect(markup.indexOf("nicu-chiciuc/weight_tsx")).toBeLessThan(markup.indexOf("apps/api"));
    expect(markup.indexOf("?add-convex")).toBeLessThan(markup.indexOf("apps/api"));
    expect(markup.indexOf("worker-root")).toBeLessThan(markup.indexOf("apps/api"));
    expect(markup.indexOf("apps/api")).toBeLessThan(markup.indexOf("worker-api"));
    expect(markup).not.toContain(">.<");
  });
});
