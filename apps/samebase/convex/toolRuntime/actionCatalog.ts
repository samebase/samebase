import { getAuthenticationStatusContract } from "../mcp/contracts/getAuthenticationStatus";
import { submitFeedbackContract } from "../mcp/contracts/submitFeedback";
import { createRepositoryContract } from "../repository/contracts/createRepository";
import { getUserRepositoriesContract } from "../repository/contracts/getUserRepositories";
import { connectRepositoryContract } from "../repository/contracts/connectRepository";
import {
  cloudflareAttachWorkersContract,
  cloudflareCreateWorkerContract,
  cloudflareDiscoverWorkersContract,
} from "../repository/contracts/cloudflareAttachments";
import {
  convexAttachProjectsContract,
  convexDiscoverProjectsContract,
} from "../repository/contracts/convexAttachments";
import { cloudflareConfigureWorkersBuildsForGitHubContract } from "../repository/contracts/cloudflareConfigureWorkersBuildsForGitHub";
import { cloudflareRotateConvexDeployKeysForWorkersBuildsContract } from "../repository/contracts/cloudflareRotateConvexDeployKeysForWorkersBuilds";
import { retryInfrastructureProvisioningContract } from "../repository/contracts/retryInfrastructureProvisioning";
import { createBrowserHandoffContract } from "../agentBrowserHandoff/contracts/createBrowserHandoff";
import { cloudflareListWorkersBuildTokensContract } from "../repository/contracts/cloudflareBuildTokens";

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
  getUserRepositoriesContract,
  cloudflareListWorkersBuildTokensContract,
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
  submitFeedbackContract,
  createBrowserHandoffContract,
  getAuthenticationStatusContract,
] as const;

export type ActionContract = (typeof actionContracts)[number];
export type ActionContractId = ActionContract["id"];
export type ActionContractMcpName = ActionContract["mcp"]["name"];
