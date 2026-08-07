import { getAuthenticationStatusContract } from "../mcp/contracts/getAuthenticationStatus";
import { createRepositoryContract } from "../vault/contracts/createRepository";
import { getUserVaultsContract } from "../vault/contracts/getUserVaults";
import { connectRepositoryContract } from "../vault/contracts/connectRepository";
import {
  cloudflareAttachWorkersContract,
  cloudflareCreateWorkerContract,
  cloudflareDiscoverWorkersContract,
} from "../vault/contracts/cloudflareAttachments";
import {
  convexAttachProjectsContract,
  convexDiscoverProjectsContract,
} from "../vault/contracts/convexAttachments";
import { cloudflareConfigureWorkersBuildsForGitHubContract } from "../vault/contracts/cloudflareConfigureWorkersBuildsForGitHub";
import { cloudflareRotateConvexDeployKeysForWorkersBuildsContract } from "../vault/contracts/cloudflareRotateConvexDeployKeysForWorkersBuilds";
import { retryInfrastructureProvisioningContract } from "../vault/contracts/retryInfrastructureProvisioning";
import { createBrowserHandoffContract } from "../agentBrowserHandoff/contracts/createBrowserHandoff";

/**
The one base for operational actions (rfcs/093): every entry is a contract module colocated with
its Convex function, and every agent-facing surface renders from this list: the MCP tool catalog,
the supported OAuth scopes, usage attribution names, the generated /docs/actions pages, llms.txt
entries, and the ChatGPT submission file. `id` is the catalog vocabulary in snake_case;
`mcp.name` is the wire-level MCP tool name.

Order is the presentation order in generated docs: app inventory first, then create/import,
discovery reads, attach, and repairs. Browser handoff stays near the end, and authentication status
is last because it is a diagnostic action, not a preflight.
*/
export const actionContracts = [
  getUserVaultsContract,
  createRepositoryContract,
  connectRepositoryContract,
  convexDiscoverProjectsContract,
  cloudflareDiscoverWorkersContract,
  convexAttachProjectsContract,
  cloudflareAttachWorkersContract,
  cloudflareCreateWorkerContract,
  cloudflareConfigureWorkersBuildsForGitHubContract,
  cloudflareRotateConvexDeployKeysForWorkersBuildsContract,
  retryInfrastructureProvisioningContract,
  createBrowserHandoffContract,
  getAuthenticationStatusContract,
] as const;

export type ActionContract = (typeof actionContracts)[number];
export type ActionContractId = ActionContract["id"];
export type ActionContractMcpName = ActionContract["mcp"]["name"];
