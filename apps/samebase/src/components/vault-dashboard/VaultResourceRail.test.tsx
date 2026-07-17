// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../../convex/_generated/dataModel";
import { VaultResourceRail, type VaultResourceRailState } from "./VaultResourceRail";

const { act } = React;
type VaultResourceRailGithubRow = VaultResourceRailState["githubRow"];
type VaultResourceRailAppRow = VaultResourceRailState["apps"][number]["rows"][number];
type WithoutRowId<TRow> = TRow extends { rowId: string } ? Omit<TRow, "rowId"> : never;
type TestVaultResourceRailGithubRow = WithoutRowId<VaultResourceRailGithubRow>;
type TestVaultResourceRailAppRow = WithoutRowId<VaultResourceRailAppRow>;

function fakeAppId(): Id<"vaultApps"> {
  // @ts-expect-error Convex ids are strings at runtime; this render test only
  // needs a stable app id.
  return "a17f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fakeNestedAppId(): Id<"vaultApps"> {
  // @ts-expect-error Convex ids are strings at runtime; this render test only
  // needs a second stable app id.
  return "a27f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

let rootElement: HTMLDivElement | null = null;
let root: Root | null = null;

function buildRootResourceRailState({
  appRows,
  githubRow,
}: {
  appRows: readonly TestVaultResourceRailAppRow[];
  githubRow: TestVaultResourceRailGithubRow;
}): VaultResourceRailState {
  return {
    githubRow: { ...githubRow, rowId: "github" },
    apps: [
      {
        appId: fakeAppId(),
        rootDirectory: "/",
        rows: appRows.map((row, index) => ({ ...row, rowId: `${row.provider}:${index}` })),
      },
    ],
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
              href: "/vault/nicu-chiciuc/weight_tsx?add-convex",
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
              href: "/vault/nicu-chiciuc/weight_tsx?add-cloudflare",
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
              href: "/vault/nicu-chiciuc/weight_tsx?add-cloudflare",
            },
          ],
        },
      ],
    });

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);

    expect(markup).toContain("Open Cloudflare: nicuchiciuc/weight-tsx");
    expect(markup).toContain('href="/vault/nicu-chiciuc/weight_tsx?add-cloudflare"');
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
              href: "/vault/nicu-chiciuc/weight_tsx?add-convex&root-directory=apps%2Fnoter",
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
    expect(link.getAttribute("href")).toBe(
      "/vault/nicu-chiciuc/weight_tsx?add-convex&root-directory=apps%2Fnoter",
    );

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

  it("keeps root providers top-level and groups folder providers by root directory", () => {
    const state = {
      githubRow: {
        provider: "github",
        rowId: "github",
        status: "ready",
        value: "nicu-chiciuc/weight_tsx",
        href: "https://github.com/nicu-chiciuc/weight_tsx",
      },
      apps: [
        {
          appId: fakeAppId(),
          rootDirectory: "/",
          rows: [
            {
              provider: "convex",
              rowId: "convex:add",
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
              rowId: "cloudflare:root",
              status: "ready",
              value: "worker-root",
            },
          ],
        },
        {
          appId: fakeNestedAppId(),
          rootDirectory: "apps/api",
          rows: [
            {
              provider: "cloudflare",
              rowId: "cloudflare:api",
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
