import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { VaultResourceRail, type VaultResourceRailState } from "./VaultResourceRail";

type VaultResourceRailGithubRow = VaultResourceRailState["githubRow"];
type VaultResourceRailAppRow = VaultResourceRailState["apps"][number]["rows"][number];

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

describe("VaultResourceRail", () => {
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
  });

  it("groups provider resources under app roots", () => {
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
    expect(markup.indexOf("nicu-chiciuc/weight_tsx")).toBeLessThan(markup.indexOf("apps/api"));
    expect(markup.indexOf("apps/api")).toBeLessThan(markup.indexOf("worker-api"));
  });
});
