import { createRepositoryContract } from "../vault/createRepositoryContract";
import { getUserVaultsContract } from "../vault/getUserVaultsContract";
import { connectRepositoryContract } from "../vault/connectRepositoryContract";
import { convexListProjectsContract } from "../vault/convexListProjectsContract";
import { cloudflareListAccountsContract } from "../vault/cloudflareListAccountsContract";
import { cloudflareListWorkersContract } from "../vault/cloudflareListWorkersContract";
import { convexConnectExistingProjectContract } from "../vault/convexConnectExistingProjectContract";
import { cloudflareConnectExistingWorkerContract } from "../vault/cloudflareConnectExistingWorkerContract";
import { cloudflareWireBuildsContract } from "../vault/cloudflareWireBuildsContract";
import { cloudflareWireConvexBuildAccessContract } from "../vault/cloudflareWireConvexBuildAccessContract";
import { retryInfrastructureProvisioningContract } from "../vault/retryInfrastructureProvisioningContract";

/**
The one base for operational actions (rfcs/093): every entry is a contract module colocated with
its Convex function, and every agent-facing surface renders from this list — the MCP tool catalog,
the supported OAuth scopes, usage attribution names, the generated /docs/actions pages, llms.txt
entries, and the ChatGPT submission file. `id` is the catalog vocabulary (snake_case; also the
`nextAction` value space), `mcp.name` is the wire-level MCP tool name.

Order is the presentation order in generated docs: the status noun first, then create/import, then
discovery reads, then attach, then repairs.
*/
export const actionContracts = [
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
  retryInfrastructureProvisioningContract,
] as const;

export type ActionContract = (typeof actionContracts)[number];
export type ActionContractId = ActionContract["id"];
export type ActionContractMcpName = ActionContract["mcp"]["name"];
