import { getAuthenticationStatusContract } from "../mcp/contracts/getAuthenticationStatus";
import { createRepositoryContract } from "../vault/contracts/createRepository";
import { getUserVaultsContract } from "../vault/contracts/getUserVaults";
import { connectRepositoryContract } from "../vault/contracts/connectRepository";
import { cloudflareListAccountsContract } from "../vault/contracts/cloudflareListAccounts";
import {
  cloudflareAttachWorkersContract,
  cloudflareDiscoverWorkersContract,
} from "../vault/contracts/cloudflareAttachments";
import {
  convexAttachProjectsContract,
  convexDiscoverProjectsContract,
} from "../vault/contracts/convexAttachments";
import { cloudflareConfigureWorkersBuildsForGitHubContract } from "../vault/contracts/cloudflareConfigureWorkersBuildsForGitHub";
import { cloudflareRotateConvexDeployKeysForWorkersBuildsContract } from "../vault/contracts/cloudflareRotateConvexDeployKeysForWorkersBuilds";
import { retryInfrastructureProvisioningContract } from "../vault/contracts/retryInfrastructureProvisioning";
import { retryProviderWriteRecoveryContract } from "../vault/contracts/retryProviderWriteRecovery";
import { createBrowserHandoffContract } from "../agentBrowserHandoff/contracts/createBrowserHandoff";

/**
The one base for operational actions (rfcs/093): every entry is a contract module colocated with
its Convex function, and every agent-facing surface renders from this list: the MCP tool catalog,
the supported OAuth scopes, usage attribution names, the generated /docs/actions pages, llms.txt
entries, and the ChatGPT submission file. `id` is the catalog vocabulary in snake_case;
`mcp.name` is the wire-level MCP tool name.

Order is the presentation order in generated docs: the status noun first, then create/import, then
discovery reads, then attach, then repairs.
*/
export const actionContracts = [
  getAuthenticationStatusContract,
  getUserVaultsContract,
  createRepositoryContract,
  connectRepositoryContract,
  convexDiscoverProjectsContract,
  cloudflareListAccountsContract,
  cloudflareDiscoverWorkersContract,
  convexAttachProjectsContract,
  cloudflareAttachWorkersContract,
  cloudflareConfigureWorkersBuildsForGitHubContract,
  cloudflareRotateConvexDeployKeysForWorkersBuildsContract,
  retryProviderWriteRecoveryContract,
  retryInfrastructureProvisioningContract,
  createBrowserHandoffContract,
] as const;

export type ActionContract = (typeof actionContracts)[number];
export type ActionContractId = ActionContract["id"];
export type ActionContractMcpName = ActionContract["mcp"]["name"];
