import { describe, expect, it } from "vite-plus/test";

import { actionContracts } from "./actionCatalog";

describe("action catalog presentation order", () => {
  it("leads with inventory and keeps diagnostic actions at the end", () => {
    expect(actionContracts.map((contract) => contract.id)).toEqual([
      "get_user_vaults",
      "create_repository",
      "connect_existing_repository",
      "discover_convex_projects",
      "list_cloudflare_accounts",
      "discover_cloudflare_workers",
      "attach_convex_projects",
      "attach_cloudflare_workers",
      "create_cloudflare_worker",
      "configure_workers_builds_for_github",
      "rotate_convex_deploy_keys_for_workers_builds",
      "retry_infrastructure_provisioning",
      "get_authentication_status",
    ]);
  });
});
