import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  VaultResourceRail,
  type VaultResourceRailState,
} from "./VaultResourceRail";

describe("VaultResourceRail", () => {
  it("renders explicit provider resource states and actions", () => {
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
          status: "action_required",
          actions: [
            {
              kind: "connect_existing",
              label: "Connect Worker",
            },
            {
              kind: "create_new",
              label: "Create Worker",
            },
          ],
        },
      ],
    } satisfies VaultResourceRailState;

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);

    expect(markup).toContain("nicu-chiciuc/weight_tsx");
    expect(markup).not.toContain("Not connected");
    expect(markup).toContain("Connect");
    expect(markup).toContain("Create");
    expect(markup).toContain("Connect Worker");
    expect(markup).toContain("Create Worker");
    expect(markup).not.toContain("Connected existing");
  });

  it("renders current status and failure context below resource links", () => {
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
          statusText: "Creating Convex project.",
          value: "weight-tsx",
        },
        {
          provider: "cloudflare",
          status: "failed",
          statusText:
            "Multiple Cloudflare accounts are available. Select an account before provisioning can continue.",
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
    expect(markup).toContain("Creating Convex project.");
    expect(markup).toContain("Multiple Cloudflare accounts are available.");
    expect(markup).toContain("Retry");
  });
});
