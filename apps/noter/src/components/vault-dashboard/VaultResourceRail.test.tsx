import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  VaultResourceRail,
  type VaultResourceRailState,
} from "./VaultResourceRail";

describe("VaultResourceRail", () => {
  it("renders explicit provider resource states and scoped links", () => {
    const state = {
      rows: [
        {
          provider: "github",
          status: "ready",
          value: "nicu-chiciuc/weight_tsx",
          href: "https://github.com/nicu-chiciuc/weight_tsx",
        },
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
    } satisfies VaultResourceRailState;

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
    const state = {
      rows: [
        {
          provider: "github",
          status: "ready",
          value: "nicu-chiciuc/weight_tsx",
          href: "https://github.com/nicu-chiciuc/weight_tsx",
        },
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
    } satisfies VaultResourceRailState;

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);

    expect(markup).toContain("Open GitHub");
    expect(markup).not.toContain("Creating Convex project.");
    expect(markup).not.toContain("Multiple Cloudflare accounts are available.");
    expect(markup).toContain("Retry");
  });

  it("keeps unwired actions disabled", () => {
    const state = {
      rows: [
        {
          provider: "github",
          status: "ready",
          value: "nicu-chiciuc/weight_tsx",
          href: "https://github.com/nicu-chiciuc/weight_tsx",
        },
        {
          provider: "convex",
          status: "action_required",
          actions: [
            {
              kind: "connect_existing",
              label: "Connect",
            },
            {
              kind: "create_new",
              label: "Create",
            },
          ],
        },
        {
          provider: "cloudflare",
          status: "pending",
          value: "weight-tsx",
        },
      ],
    } satisfies VaultResourceRailState;

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);

    expect(markup).toMatch(
      /disabled=""[^>]*aria-label="Connect Convex"|aria-label="Connect Convex"[^>]*disabled=""/,
    );
    expect(markup).toMatch(
      /disabled=""[^>]*aria-label="Create Convex"|aria-label="Create Convex"[^>]*disabled=""/,
    );
  });
});
