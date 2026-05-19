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
          value: "Not connected",
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
          value: "Not connected",
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
    expect(markup).toContain("Not connected");
    expect(markup).toContain("Connect");
    expect(markup).toContain("Create");
    expect(markup).toContain("Connect Worker");
    expect(markup).toContain("Create Worker");
    expect(markup).not.toContain("Connected existing");
  });
});
