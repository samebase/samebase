import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  VaultResourceRail,
  type VaultResourceRailState,
} from "./VaultResourceRail";

describe("VaultResourceRail", () => {
  it("renders explicit provider resource states and actions", () => {
    const state = {
      github: {
        state: "connected",
        origin: "connected_existing",
        repositoryFullName: "nicu-chiciuc/weight_tsx",
        href: "https://github.com/nicu-chiciuc/weight_tsx",
      },
      convex: {
        state: "not_configured",
        detail: "Select an existing deployment or create a new project.",
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
      cloudflare: {
        state: "not_configured",
        detail: "Create a Worker or connect one from the selected account.",
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
    } satisfies VaultResourceRailState;

    const markup = renderToStaticMarkup(<VaultResourceRail state={state} />);

    expect(markup).toContain("nicu-chiciuc/weight_tsx");
    expect(markup).toContain("Not connected");
    expect(markup).toContain("Connect");
    expect(markup).toContain("Create");
    expect(markup).toContain("Connect Worker");
    expect(markup).toContain("Create Worker");
  });
});
