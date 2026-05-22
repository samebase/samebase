/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent_graph from "../agent/graph.js";
import type * as agent_replaceInFile from "../agent/replaceInFile.js";
import type * as agent_systemPrompt from "../agent/systemPrompt.js";
import type * as agent_toolCatalog from "../agent/toolCatalog.js";
import type * as agent_tools from "../agent/tools.js";
import type * as agentGraphActions from "../agentGraphActions.js";
import type * as agentGraphLayout from "../agentGraphLayout.js";
import type * as appProvisioningEvents from "../appProvisioningEvents.js";
import type * as appProvisioningRuns from "../appProvisioningRuns.js";
import type * as appProvisioningWorkflow from "../appProvisioningWorkflow.js";
import type * as appProvisioningWorkflowActions from "../appProvisioningWorkflowActions.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as chat_actions from "../chat/actions.js";
import type * as chat_commitProposalClaim from "../chat/commitProposalClaim.js";
import type * as chat_index from "../chat/index.js";
import type * as chat_metadata from "../chat/metadata.js";
import type * as chat_prodAccess from "../chat/prodAccess.js";
import type * as chat_threads from "../chat/threads.js";
import type * as cleanupCloudflare from "../cleanupCloudflare.js";
import type * as cloudflareAccountDiscovery from "../cloudflareAccountDiscovery.js";
import type * as cloudflareApi_client from "../cloudflareApi/client.js";
import type * as cloudflareMcp from "../cloudflareMcp.js";
import type * as cloudflareMcpOAuth from "../cloudflareMcpOAuth.js";
import type * as cloudflarePreviewComment from "../cloudflarePreviewComment.js";
import type * as cloudflareResources from "../cloudflareResources.js";
import type * as codespaces_executor from "../codespaces/executor.js";
import type * as codespaces_index from "../codespaces/index.js";
import type * as codespaces_model from "../codespaces/model.js";
import type * as codespaces_mutations from "../codespaces/mutations.js";
import type * as codespaces_ports from "../codespaces/ports.js";
import type * as codespaces_vaultIntegration from "../codespaces/vaultIntegration.js";
import type * as collaborative from "../collaborative.js";
import type * as common from "../common.js";
import type * as connectedMachineControl from "../connectedMachineControl.js";
import type * as connectedMachineHttp from "../connectedMachineHttp.js";
import type * as connectedMachineModel from "../connectedMachineModel.js";
import type * as connectedMachines from "../connectedMachines.js";
import type * as convexManagementApi_client from "../convexManagementApi/client.js";
import type * as convexManagementApi_errors from "../convexManagementApi/errors.js";
import type * as convexManagementApi_oauthToken from "../convexManagementApi/oauthToken.js";
import type * as convexOAuth from "../convexOAuth.js";
import type * as dashboardSettings from "../dashboardSettings.js";
import type * as deploymentProfile from "../deploymentProfile.js";
import type * as devAuth from "../devAuth.js";
import type * as fileStaging from "../fileStaging.js";
import type * as fileStagingActions from "../fileStagingActions.js";
import type * as folderExpansion from "../folderExpansion.js";
import type * as gitOperations from "../gitOperations.js";
import type * as gitOperationsActions from "../gitOperationsActions.js";
import type * as github from "../github.js";
import type * as githubChecks from "../githubChecks.js";
import type * as githubOAuth from "../githubOAuth.js";
import type * as http from "../http.js";
import type * as infraProvisioning from "../infraProvisioning.js";
import type * as infraRead from "../infraRead.js";
import type * as infraReadPolicy from "../infraReadPolicy.js";
import type * as infraReadQueries from "../infraReadQueries.js";
import type * as jsonUtils from "../jsonUtils.js";
import type * as mcp_http from "../mcp/http.js";
import type * as mcp_oauth from "../mcp/oauth.js";
import type * as mcp_protocol from "../mcp/protocol.js";
import type * as mcp_tokens from "../mcp/tokens.js";
import type * as mcp_tools from "../mcp/tools.js";
import type * as mcpTokenHealth from "../mcpTokenHealth.js";
import type * as oauthState from "../oauthState.js";
import type * as oauthUtils from "../oauthUtils.js";
import type * as polarWebhooks from "../polarWebhooks.js";
import type * as providerApiLog from "../providerApiLog.js";
import type * as providerConnections from "../providerConnections.js";
import type * as repositoryRefresh from "../repositoryRefresh.js";
import type * as repositoryRefreshModel from "../repositoryRefreshModel.js";
import type * as slugUtils from "../slugUtils.js";
import type * as stagingChanges from "../stagingChanges.js";
import type * as stagingRebase from "../stagingRebase.js";
import type * as starterSeed from "../starterSeed.js";
import type * as toolRuntime_catalog from "../toolRuntime/catalog.js";
import type * as toolRuntime_executors from "../toolRuntime/executors.js";
import type * as toolRuntime_policy from "../toolRuntime/policy.js";
import type * as toolRuntime_queries from "../toolRuntime/queries.js";
import type * as toolRuntime_runtime from "../toolRuntime/runtime.js";
import type * as toolRuntime_types from "../toolRuntime/types.js";
import type * as toolRuntime_utils from "../toolRuntime/utils.js";
import type * as users from "../users.js";
import type * as vault_actions from "../vault/actions.js";
import type * as vault_branches from "../vault/branches.js";
import type * as vault_cloudflare from "../vault/cloudflare.js";
import type * as vault_cloudflareMutations from "../vault/cloudflareMutations.js";
import type * as vault_dashboard from "../vault/dashboard.js";
import type * as vault_deletion_cleanup from "../vault/deletion/cleanup.js";
import type * as vault_deletion_eligibility from "../vault/deletion/eligibility.js";
import type * as vault_deletion_events from "../vault/deletion/events.js";
import type * as vault_deletion_model from "../vault/deletion/model.js";
import type * as vault_deletion_providerActions from "../vault/deletion/providerActions.js";
import type * as vault_deletion_runs from "../vault/deletion/runs.js";
import type * as vault_deletion_state from "../vault/deletion/state.js";
import type * as vault_deletion_workflow from "../vault/deletion/workflow.js";
import type * as vault_model from "../vault/model.js";
import type * as vault_records from "../vault/records.js";
import type * as vault_state from "../vault/state.js";
import type * as waitlist from "../waitlist.js";
import type * as waitlistActions from "../waitlistActions.js";
import type * as workspaceSidebarState from "../workspaceSidebarState.js";
import type * as workspaceSidebarStateModel from "../workspaceSidebarStateModel.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agent/graph": typeof agent_graph;
  "agent/replaceInFile": typeof agent_replaceInFile;
  "agent/systemPrompt": typeof agent_systemPrompt;
  "agent/toolCatalog": typeof agent_toolCatalog;
  "agent/tools": typeof agent_tools;
  agentGraphActions: typeof agentGraphActions;
  agentGraphLayout: typeof agentGraphLayout;
  appProvisioningEvents: typeof appProvisioningEvents;
  appProvisioningRuns: typeof appProvisioningRuns;
  appProvisioningWorkflow: typeof appProvisioningWorkflow;
  appProvisioningWorkflowActions: typeof appProvisioningWorkflowActions;
  auth: typeof auth;
  billing: typeof billing;
  "chat/actions": typeof chat_actions;
  "chat/commitProposalClaim": typeof chat_commitProposalClaim;
  "chat/index": typeof chat_index;
  "chat/metadata": typeof chat_metadata;
  "chat/prodAccess": typeof chat_prodAccess;
  "chat/threads": typeof chat_threads;
  cleanupCloudflare: typeof cleanupCloudflare;
  cloudflareAccountDiscovery: typeof cloudflareAccountDiscovery;
  "cloudflareApi/client": typeof cloudflareApi_client;
  cloudflareMcp: typeof cloudflareMcp;
  cloudflareMcpOAuth: typeof cloudflareMcpOAuth;
  cloudflarePreviewComment: typeof cloudflarePreviewComment;
  cloudflareResources: typeof cloudflareResources;
  "codespaces/executor": typeof codespaces_executor;
  "codespaces/index": typeof codespaces_index;
  "codespaces/model": typeof codespaces_model;
  "codespaces/mutations": typeof codespaces_mutations;
  "codespaces/ports": typeof codespaces_ports;
  "codespaces/vaultIntegration": typeof codespaces_vaultIntegration;
  collaborative: typeof collaborative;
  common: typeof common;
  connectedMachineControl: typeof connectedMachineControl;
  connectedMachineHttp: typeof connectedMachineHttp;
  connectedMachineModel: typeof connectedMachineModel;
  connectedMachines: typeof connectedMachines;
  "convexManagementApi/client": typeof convexManagementApi_client;
  "convexManagementApi/errors": typeof convexManagementApi_errors;
  "convexManagementApi/oauthToken": typeof convexManagementApi_oauthToken;
  convexOAuth: typeof convexOAuth;
  dashboardSettings: typeof dashboardSettings;
  deploymentProfile: typeof deploymentProfile;
  devAuth: typeof devAuth;
  fileStaging: typeof fileStaging;
  fileStagingActions: typeof fileStagingActions;
  folderExpansion: typeof folderExpansion;
  gitOperations: typeof gitOperations;
  gitOperationsActions: typeof gitOperationsActions;
  github: typeof github;
  githubChecks: typeof githubChecks;
  githubOAuth: typeof githubOAuth;
  http: typeof http;
  infraProvisioning: typeof infraProvisioning;
  infraRead: typeof infraRead;
  infraReadPolicy: typeof infraReadPolicy;
  infraReadQueries: typeof infraReadQueries;
  jsonUtils: typeof jsonUtils;
  "mcp/http": typeof mcp_http;
  "mcp/oauth": typeof mcp_oauth;
  "mcp/protocol": typeof mcp_protocol;
  "mcp/tokens": typeof mcp_tokens;
  "mcp/tools": typeof mcp_tools;
  mcpTokenHealth: typeof mcpTokenHealth;
  oauthState: typeof oauthState;
  oauthUtils: typeof oauthUtils;
  polarWebhooks: typeof polarWebhooks;
  providerApiLog: typeof providerApiLog;
  providerConnections: typeof providerConnections;
  repositoryRefresh: typeof repositoryRefresh;
  repositoryRefreshModel: typeof repositoryRefreshModel;
  slugUtils: typeof slugUtils;
  stagingChanges: typeof stagingChanges;
  stagingRebase: typeof stagingRebase;
  starterSeed: typeof starterSeed;
  "toolRuntime/catalog": typeof toolRuntime_catalog;
  "toolRuntime/executors": typeof toolRuntime_executors;
  "toolRuntime/policy": typeof toolRuntime_policy;
  "toolRuntime/queries": typeof toolRuntime_queries;
  "toolRuntime/runtime": typeof toolRuntime_runtime;
  "toolRuntime/types": typeof toolRuntime_types;
  "toolRuntime/utils": typeof toolRuntime_utils;
  users: typeof users;
  "vault/actions": typeof vault_actions;
  "vault/branches": typeof vault_branches;
  "vault/cloudflare": typeof vault_cloudflare;
  "vault/cloudflareMutations": typeof vault_cloudflareMutations;
  "vault/dashboard": typeof vault_dashboard;
  "vault/deletion/cleanup": typeof vault_deletion_cleanup;
  "vault/deletion/eligibility": typeof vault_deletion_eligibility;
  "vault/deletion/events": typeof vault_deletion_events;
  "vault/deletion/model": typeof vault_deletion_model;
  "vault/deletion/providerActions": typeof vault_deletion_providerActions;
  "vault/deletion/runs": typeof vault_deletion_runs;
  "vault/deletion/state": typeof vault_deletion_state;
  "vault/deletion/workflow": typeof vault_deletion_workflow;
  "vault/model": typeof vault_model;
  "vault/records": typeof vault_records;
  "vault/state": typeof vault_state;
  waitlist: typeof waitlist;
  waitlistActions: typeof waitlistActions;
  workspaceSidebarState: typeof workspaceSidebarState;
  workspaceSidebarStateModel: typeof workspaceSidebarStateModel;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  repositoryRefreshWorkpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"repositoryRefreshWorkpool">;
};
