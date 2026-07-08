import { getAuthenticationStatusContract } from "../mcp/contracts/getAuthenticationStatus";
import { createRepositoryContract } from "../vault/contracts/createRepository";
import { getUserVaultsContract } from "../vault/contracts/getUserVaults";
import { connectRepositoryContract } from "../vault/contracts/connectRepository";
import { convexListProjectsContract } from "../vault/contracts/convexListProjects";
import { cloudflareListAccountsContract } from "../vault/contracts/cloudflareListAccounts";
import { cloudflareListWorkersContract } from "../vault/contracts/cloudflareListWorkers";
import { convexConnectExistingProjectContract } from "../vault/contracts/convexConnectExistingProject";
import { cloudflareConnectExistingWorkerContract } from "../vault/contracts/cloudflareConnectExistingWorker";
import { cloudflareWireBuildsContract } from "../vault/contracts/cloudflareWireBuilds";
import { cloudflareWireConvexBuildAccessContract } from "../vault/contracts/cloudflareWireConvexBuildAccess";
import { cloudflareVerifyInfrastructureContract } from "../vault/contracts/cloudflareVerifyInfrastructure";
import { retryInfrastructureProvisioningContract } from "../vault/contracts/retryInfrastructureProvisioning";

/**
The one base for operational actions (rfcs/093): every entry is a contract module colocated with
its Convex function, and every agent-facing surface renders from this list: the MCP tool catalog,
the supported OAuth scopes, usage attribution names, the generated /docs/actions pages, llms.txt
entries, and the ChatGPT submission file. `id` is the catalog vocabulary (snake_case; also the
`nextAction` value space), `mcp.name` is the wire-level MCP tool name.

Order is the presentation order in generated docs: the status noun first, then create/import, then
discovery reads, then attach, then repairs.
*/
export const actionContracts = [
  getAuthenticationStatusContract,
  getUserVaultsContract,
  createRepositoryContract,
  connectRepositoryContract,
  convexListProjectsContract,
  cloudflareListAccountsContract,
  cloudflareListWorkersContract,
  convexConnectExistingProjectContract,
  cloudflareConnectExistingWorkerContract,
  cloudflareWireBuildsContract,
  cloudflareWireConvexBuildAccessContract,
  cloudflareVerifyInfrastructureContract,
  retryInfrastructureProvisioningContract,
] as const;

export type ActionContract = (typeof actionContracts)[number];
export type ActionContractId = ActionContract["id"];
export type ActionContractMcpName = ActionContract["mcp"]["name"];
