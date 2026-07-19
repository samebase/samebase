// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { VaultResourceRail, type VaultResourceRailState } from "./VaultResourceRail";

const { act } = React;
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
    apps: [{ appId: "app-root", rootDirectory: "/", rows: appRows }],
  };
}

function availableGithubRow(): VaultResourceRailGithubRow {
  return {
    provider: "github",
    rowId: "github",
    status: "available",
    value: "nicu-chiciuc/weight_tsx",
    href: "https://github.com/nicu-chiciuc/weight_tsx",
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

  it("renders available provider resources with scoped links", () => {
    const state = buildRootResourceRailState({
      githubRow: availableGithubRow(),
      appRows: [
        {
          provider: "convex",
          rowId: "convex:project-1",
          status: "available",
          scope: "nicu",
          value: "weight-tsx",
          href: "https://dashboard.convex.dev/t/nicu/weight-tsx/settings",
        },
        {
          provider: "cloudflare",
          rowId: "cloudflare:worker-1",
          status: "available",
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
    expect(markup).toContain("Open Convex: nicu/weight-tsx");
    expect(markup).toContain("Open Cloudflare: nicuchiciuc/weight-tsx");
    expect(markup).not.toContain('target="_blank"');
  });

  it("shows loading, missing, and failed as different truthful states", () => {
    const state = buildRootResourceRailState({
      githubRow: availableGithubRow(),
      appRows: [
        {
          provider: "convex",
          rowId: "convex:project-1",
          status: "loading",
          value: "project-1",
          description: "Loading from Convex...",
        },
        {
          provider: "cloudflare",
          rowId: "cloudflare:worker-missing",
          status: "missing",
          value: "missing-worker",
          description: "Missing from Cloudflare.",
        },
        {
          provider: "cloudflare",
          rowId: "cloudflare:worker-failed",
          status: "failed",
          value: "failed-worker",
          description: "Could not load from Cloudflare.",
          actions: [{ kind: "retry", label: "Reload", onClick: () => {} }],
        },
      ],
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);

    expect(markup).toContain("Loading from Convex...");
    expect(markup).toContain("Missing from Cloudflare.");
    expect(markup).toContain("Could not load from Cloudflare.");
    expect(markup).toContain("Reload");
    expect(markup).toContain("lucide-loader-circle");
    expect(markup).toContain("lucide-circle-x");
    expect(markup).toContain("lucide-circle-alert");
  });

  it("renders every Worker attached to the same app", () => {
    const state = buildRootResourceRailState({
      githubRow: availableGithubRow(),
      appRows: [
        {
          provider: "cloudflare",
          rowId: "cloudflare:worker-web",
          status: "available",
          value: "fixture-web",
        },
        {
          provider: "cloudflare",
          rowId: "cloudflare:worker-admin",
          status: "available",
          value: "fixture-admin",
          description: "Preview URL disabled.",
        },
      ],
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);

    expect(markup).toContain("fixture-web");
    expect(markup).toContain("fixture-admin");
    expect(markup).toContain("Preview URL disabled.");
  });

  it("renders provider add actions as query links", () => {
    const state = buildRootResourceRailState({
      githubRow: availableGithubRow(),
      appRows: [
        {
          provider: "convex",
          rowId: "convex:add:app-root",
          status: "action_required",
          actions: [
            {
              kind: "add",
              label: "?add-convex",
              href: "/vault/nicu-chiciuc/weight_tsx?add-convex",
            },
          ],
        },
        {
          provider: "cloudflare",
          rowId: "cloudflare:add:app-root",
          status: "action_required",
          actions: [
            {
              kind: "add",
              label: "?add-cloudflare",
              href: "/vault/nicu-chiciuc/weight_tsx?add-cloudflare",
            },
          ],
        },
      ],
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);

    expect(markup).toContain('aria-label="Add Convex"');
    expect(markup).toContain('aria-label="Add Cloudflare"');
    expect(markup).toContain("?add-convex");
    expect(markup).toContain("?add-cloudflare");
  });

  it("uses router callbacks for ordinary href action clicks", () => {
    const onClick = vi.fn();
    const state = buildRootResourceRailState({
      githubRow: availableGithubRow(),
      appRows: [
        {
          provider: "convex",
          rowId: "convex:add:app-root",
          status: "action_required",
          actions: [
            {
              kind: "add",
              label: "?add-convex",
              href: "/vault/nicu-chiciuc/weight_tsx?add-convex&app-root=apps%2Fnoter",
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

  it("keeps repository-root resources top-level and groups nested apps", () => {
    const state = {
      githubRow: availableGithubRow(),
      apps: [
        {
          appId: "app-root",
          rootDirectory: "/",
          rows: [
            {
              provider: "cloudflare",
              rowId: "cloudflare:worker-root",
              status: "available",
              value: "worker-root",
            },
          ],
        },
        {
          appId: "app-api",
          rootDirectory: "apps/api",
          rows: [
            {
              provider: "cloudflare",
              rowId: "cloudflare:worker-api",
              status: "available",
              value: "worker-api",
            },
          ],
        },
      ],
    } satisfies VaultResourceRailState;

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);

    expect(markup).toContain("apps/api");
    expect(markup).toContain("lucide-chevron-down");
    expect(markup.indexOf("worker-root")).toBeLessThan(markup.indexOf("apps/api"));
    expect(markup.indexOf("apps/api")).toBeLessThan(markup.indexOf("worker-api"));
    expect(markup).not.toContain(">&lt;/&gt;<");
  });
});
