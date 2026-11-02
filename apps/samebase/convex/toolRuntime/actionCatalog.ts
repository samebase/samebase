import { getAuthenticationStatusContract } from "../mcp/contracts/getAuthenticationStatus";
import { submitFeedbackContract } from "../mcp/contracts/submitFeedback";
import { createRepositoryContract } from "../repository/contracts/createRepository";
import { getUserRepositoriesContract } from "../repository/contracts/getUserRepositories";
import { getRepositoryStatusContract } from "../repository/contracts/getRepositoryStatus";
import { connectRepositoryContract } from "../repository/contracts/connectRepository";
import { retryInfrastructureProvisioningContract } from "../repository/contracts/retryInfrastructureProvisioning";
import { createBrowserHandoffContract } from "../agentBrowserHandoff/contracts/createBrowserHandoff";

/**
The one base for operational actions (rfcs/093): every entry is a contract module colocated with
its Convex function, and every agent-facing surface renders from this list: the MCP tool catalog,
the supported OAuth scopes, usage attribution names, the generated /docs/actions pages, llms.txt
entries, and the ChatGPT submission file. `id` is the catalog vocabulary in snake_case;
`mcp.name` is the wire-level MCP tool name: the path of the registered Convex function that runs
the tool, with `/` and `:` replaced by `_` (rfcs/125; actionCatalog.test.ts checks it).

Order is the presentation order in generated docs: reads first (inventory, then status), then create,
connect, and retry. Sign-in links stay near the end, and authentication status is last because it is
a diagnostic action, not a preflight. mcp/protocol.ts derives the supported
OAuth scope order from this list, and grant reuse compares scope strings exactly, so a reorder that
moves the first use of an access key changes the scope string that clients request.
*/
export const actionContracts = [
  getUserRepositoriesContract,
  getRepositoryStatusContract,
  createRepositoryContract,
  connectRepositoryContract,
  retryInfrastructureProvisioningContract,
  submitFeedbackContract,
  createBrowserHandoffContract,
  getAuthenticationStatusContract,
] as const;

export type ActionContract = (typeof actionContracts)[number];
export type ActionContractId = ActionContract["id"];
export type ActionContractMcpName = ActionContract["mcp"]["name"];
