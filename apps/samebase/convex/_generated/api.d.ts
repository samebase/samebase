/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accessModelValidators from "../accessModelValidators.js";
import type * as accountDeletion_authCleanup from "../accountDeletion/authCleanup.js";
import type * as accountDeletion_billingActions from "../accountDeletion/billingActions.js";
import type * as accountDeletion_cleanup from "../accountDeletion/cleanup.js";
import type * as accountDeletion_cleanupActions from "../accountDeletion/cleanupActions.js";
import type * as accountDeletion_completionEmail from "../accountDeletion/completionEmail.js";
import type * as accountDeletion_index from "../accountDeletion/index.js";
import type * as accountDeletion_model from "../accountDeletion/model.js";
import type * as accountDeletion_providerActions from "../accountDeletion/providerActions.js";
import type * as accountDeletion_stepContext from "../accountDeletion/stepContext.js";
import type * as accountDeletion_workflow from "../accountDeletion/workflow.js";
import type * as agent_actionLease from "../agent/actionLease.js";
import type * as agent_graph from "../agent/graph.js";
import type * as agent_model from "../agent/model.js";
import type * as agent_systemPrompt from "../agent/systemPrompt.js";
import type * as agentBrowserHandoff from "../agentBrowserHandoff.js";
import type * as agentBrowserHandoff_contracts_createBrowserHandoff from "../agentBrowserHandoff/contracts/createBrowserHandoff.js";
import type * as agentGraphActions from "../agentGraphActions.js";
import type * as agentGraphLayout from "../agentGraphLayout.js";
import type * as appProvisioningEvents from "../appProvisioningEvents.js";
import type * as appProvisioningModel from "../appProvisioningModel.js";
import type * as appProvisioningRuns from "../appProvisioningRuns.js";
import type * as appProvisioningWorkflow from "../appProvisioningWorkflow.js";
import type * as appProvisioningWorkflowActions from "../appProvisioningWorkflowActions.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as chat_actions from "../chat/actions.js";
import type * as chat_commitProposalClaim from "../chat/commitProposalClaim.js";
import type * as chat_index from "../chat/index.js";
import type * as chat_metadata from "../chat/metadata.js";
import type * as chat_model from "../chat/model.js";
import type * as chat_prodAccess from "../chat/prodAccess.js";
import type * as chat_prodAccessModel from "../chat/prodAccessModel.js";
import type * as chat_threads from "../chat/threads.js";
import type * as cloudflareAccountDiscovery from "../cloudflareAccountDiscovery.js";
import type * as cloudflareApi_client from "../cloudflareApi/client.js";
import type * as cloudflareMcp from "../cloudflareMcp.js";
import type * as cloudflareMcpOAuth from "../cloudflareMcpOAuth.js";
import type * as cloudflareOAuth from "../cloudflareOAuth.js";
import type * as cloudflareProviderAccess from "../cloudflareProviderAccess.js";
import type * as cloudflareResources from "../cloudflareResources.js";
import type * as codespaces_executor from "../codespaces/executor.js";
import type * as codespaces_index from "../codespaces/index.js";
import type * as codespaces_model from "../codespaces/model.js";
import type * as codespaces_mutations from "../codespaces/mutations.js";
import type * as codespaces_ports from "../codespaces/ports.js";
import type * as codespaces_vaultIntegration from "../codespaces/vaultIntegration.js";
import type * as collaborative from "../collaborative.js";
import type * as commitCheckModel from "../commitCheckModel.js";
import type * as commitChecks from "../commitChecks.js";
import type * as common from "../common.js";
import type * as connectedMachineControl from "../connectedMachineControl.js";
import type * as connectedMachineHttp from "../connectedMachineHttp.js";
import type * as connectedMachineModel from "../connectedMachineModel.js";
import type * as connectedMachines from "../connectedMachines.js";
import type * as convexManagementApi_client from "../convexManagementApi/client.js";
import type * as convexManagementApi_errors from "../convexManagementApi/errors.js";
import type * as convexManagementApi_oauthToken from "../convexManagementApi/oauthToken.js";
import type * as convexOAuth from "../convexOAuth.js";
import type * as convexProviderAccess from "../convexProviderAccess.js";
import type * as dashboardSettings from "../dashboardSettings.js";
import type * as deploymentProfile from "../deploymentProfile.js";
import type * as devAuth from "../devAuth.js";
import type * as editorModel from "../editorModel.js";
import type * as email from "../email.js";
import type * as fileStaging from "../fileStaging.js";
import type * as fileStagingActions from "../fileStagingActions.js";
import type * as folderExpansion from "../folderExpansion.js";
import type * as functions from "../functions.js";
import type * as gitOperations from "../gitOperations.js";
import type * as gitOperationsActions from "../gitOperationsActions.js";
import type * as github from "../github.js";
import type * as githubChecks from "../githubChecks.js";
import type * as githubOAuth from "../githubOAuth.js";
import type * as githubRepoApi from "../githubRepoApi.js";
import type * as http from "../http.js";
import type * as identityModel from "../identityModel.js";
import type * as infraProvisioning from "../infraProvisioning.js";
import type * as infraRead from "../infraRead.js";
import type * as infraReadPolicy from "../infraReadPolicy.js";
import type * as infraReadQueries from "../infraReadQueries.js";
import type * as jsonUtils from "../jsonUtils.js";
import type * as mcp_contracts_getAuthenticationStatus from "../mcp/contracts/getAuthenticationStatus.js";
import type * as mcp_grants from "../mcp/grants.js";
import type * as mcp_http from "../mcp/http.js";
import type * as mcp_model from "../mcp/model.js";
import type * as mcp_oauth from "../mcp/oauth.js";
import type * as mcp_protocol from "../mcp/protocol.js";
import type * as mcp_scopes from "../mcp/scopes.js";
import type * as mcp_tokens from "../mcp/tokens.js";
import type * as mcpTokenHealth from "../mcpTokenHealth.js";
import type * as newUserNotification from "../newUserNotification.js";
import type * as oauthState from "../oauthState.js";
import type * as oauthUtils from "../oauthUtils.js";
import type * as polarWebhooks from "../polarWebhooks.js";
import type * as providerApiLog from "../providerApiLog.js";
import type * as providerConnectionModel from "../providerConnectionModel.js";
import type * as providerConnections from "../providerConnections.js";
import type * as repositoryRefresh from "../repositoryRefresh.js";
import type * as repositoryRefreshModel from "../repositoryRefreshModel.js";
import type * as slugUtils from "../slugUtils.js";
import type * as stagingChanges from "../stagingChanges.js";
import type * as stagingRebase from "../stagingRebase.js";
import type * as starterSeed from "../starterSeed.js";
import type * as toolRuntime_actionCatalog from "../toolRuntime/actionCatalog.js";
import type * as toolRuntime_convexSchemas from "../toolRuntime/convexSchemas.js";
import type * as toolRuntime_mcpScopes from "../toolRuntime/mcpScopes.js";
import type * as toolRuntime_runtime from "../toolRuntime/runtime.js";
import type * as usageAttribution from "../usageAttribution.js";
import type * as userAccess from "../userAccess.js";
import type * as userPreferenceModel from "../userPreferenceModel.js";
import type * as users from "../users.js";
import type * as vault_actions from "../vault/actions.js";
import type * as vault_branchCommitSummary from "../vault/branchCommitSummary.js";
import type * as vault_branchModel from "../vault/branchModel.js";
import type * as vault_branches from "../vault/branches.js";
import type * as vault_cloudflare from "../vault/cloudflare.js";
import type * as vault_cloudflareMutations from "../vault/cloudflareMutations.js";
import type * as vault_contracts_cloudflareConnectExistingWorker from "../vault/contracts/cloudflareConnectExistingWorker.js";
import type * as vault_contracts_cloudflareListAccounts from "../vault/contracts/cloudflareListAccounts.js";
import type * as vault_contracts_cloudflareListWorkers from "../vault/contracts/cloudflareListWorkers.js";
import type * as vault_contracts_cloudflareVerifyInfrastructure from "../vault/contracts/cloudflareVerifyInfrastructure.js";
import type * as vault_contracts_cloudflareWireBuilds from "../vault/contracts/cloudflareWireBuilds.js";
import type * as vault_contracts_cloudflareWireConvexBuildAccess from "../vault/contracts/cloudflareWireConvexBuildAccess.js";
import type * as vault_contracts_connectRepository from "../vault/contracts/connectRepository.js";
import type * as vault_contracts_convexConnectExistingProject from "../vault/contracts/convexConnectExistingProject.js";
import type * as vault_contracts_convexListProjects from "../vault/contracts/convexListProjects.js";
import type * as vault_contracts_createRepository from "../vault/contracts/createRepository.js";
import type * as vault_contracts_getUserVaults from "../vault/contracts/getUserVaults.js";
import type * as vault_contracts_retryInfrastructureProvisioning from "../vault/contracts/retryInfrastructureProvisioning.js";
import type * as vault_convex from "../vault/convex.js";
import type * as vault_convexDeployKeys from "../vault/convexDeployKeys.js";
import type * as vault_convexMutations from "../vault/convexMutations.js";
import type * as vault_convexSchemaGraph from "../vault/convexSchemaGraph.js";
import type * as vault_convexSchemaGraphModel from "../vault/convexSchemaGraphModel.js";
import type * as vault_dashboard from "../vault/dashboard.js";
import type * as vault_dashboardModel from "../vault/dashboardModel.js";
import type * as vault_database from "../vault/database.js";
import type * as vault_deletion_cleanup from "../vault/deletion/cleanup.js";
import type * as vault_deletion_eligibility from "../vault/deletion/eligibility.js";
import type * as vault_deletion_events from "../vault/deletion/events.js";
import type * as vault_deletion_model from "../vault/deletion/model.js";
import type * as vault_deletion_providerActions from "../vault/deletion/providerActions.js";
import type * as vault_deletion_runs from "../vault/deletion/runs.js";
import type * as vault_deletion_state from "../vault/deletion/state.js";
import type * as vault_deletion_workflow from "../vault/deletion/workflow.js";
import type * as vault_model from "../vault/model.js";
import type * as vault_providerResourceObservationModel from "../vault/providerResourceObservationModel.js";
import type * as vault_providerResourceObservationTargets from "../vault/providerResourceObservationTargets.js";
import type * as vault_providerResourceObservations from "../vault/providerResourceObservations.js";
import type * as vault_records from "../vault/records.js";
import type * as vault_state from "../vault/state.js";
import type * as viewerRole from "../viewerRole.js";
import type * as workspaceSidebarState from "../workspaceSidebarState.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accessModelValidators: typeof accessModelValidators;
  "accountDeletion/authCleanup": typeof accountDeletion_authCleanup;
  "accountDeletion/billingActions": typeof accountDeletion_billingActions;
  "accountDeletion/cleanup": typeof accountDeletion_cleanup;
  "accountDeletion/cleanupActions": typeof accountDeletion_cleanupActions;
  "accountDeletion/completionEmail": typeof accountDeletion_completionEmail;
  "accountDeletion/index": typeof accountDeletion_index;
  "accountDeletion/model": typeof accountDeletion_model;
  "accountDeletion/providerActions": typeof accountDeletion_providerActions;
  "accountDeletion/stepContext": typeof accountDeletion_stepContext;
  "accountDeletion/workflow": typeof accountDeletion_workflow;
  "agent/actionLease": typeof agent_actionLease;
  "agent/graph": typeof agent_graph;
  "agent/model": typeof agent_model;
  "agent/systemPrompt": typeof agent_systemPrompt;
  agentBrowserHandoff: typeof agentBrowserHandoff;
  "agentBrowserHandoff/contracts/createBrowserHandoff": typeof agentBrowserHandoff_contracts_createBrowserHandoff;
  agentGraphActions: typeof agentGraphActions;
  agentGraphLayout: typeof agentGraphLayout;
  appProvisioningEvents: typeof appProvisioningEvents;
  appProvisioningModel: typeof appProvisioningModel;
  appProvisioningRuns: typeof appProvisioningRuns;
  appProvisioningWorkflow: typeof appProvisioningWorkflow;
  appProvisioningWorkflowActions: typeof appProvisioningWorkflowActions;
  auth: typeof auth;
  billing: typeof billing;
  "chat/actions": typeof chat_actions;
  "chat/commitProposalClaim": typeof chat_commitProposalClaim;
  "chat/index": typeof chat_index;
  "chat/metadata": typeof chat_metadata;
  "chat/model": typeof chat_model;
  "chat/prodAccess": typeof chat_prodAccess;
  "chat/prodAccessModel": typeof chat_prodAccessModel;
  "chat/threads": typeof chat_threads;
  cloudflareAccountDiscovery: typeof cloudflareAccountDiscovery;
  "cloudflareApi/client": typeof cloudflareApi_client;
  cloudflareMcp: typeof cloudflareMcp;
  cloudflareMcpOAuth: typeof cloudflareMcpOAuth;
  cloudflareOAuth: typeof cloudflareOAuth;
  cloudflareProviderAccess: typeof cloudflareProviderAccess;
  cloudflareResources: typeof cloudflareResources;
  "codespaces/executor": typeof codespaces_executor;
  "codespaces/index": typeof codespaces_index;
  "codespaces/model": typeof codespaces_model;
  "codespaces/mutations": typeof codespaces_mutations;
  "codespaces/ports": typeof codespaces_ports;
  "codespaces/vaultIntegration": typeof codespaces_vaultIntegration;
  collaborative: typeof collaborative;
  commitCheckModel: typeof commitCheckModel;
  commitChecks: typeof commitChecks;
  common: typeof common;
  connectedMachineControl: typeof connectedMachineControl;
  connectedMachineHttp: typeof connectedMachineHttp;
  connectedMachineModel: typeof connectedMachineModel;
  connectedMachines: typeof connectedMachines;
  "convexManagementApi/client": typeof convexManagementApi_client;
  "convexManagementApi/errors": typeof convexManagementApi_errors;
  "convexManagementApi/oauthToken": typeof convexManagementApi_oauthToken;
  convexOAuth: typeof convexOAuth;
  convexProviderAccess: typeof convexProviderAccess;
  dashboardSettings: typeof dashboardSettings;
  deploymentProfile: typeof deploymentProfile;
  devAuth: typeof devAuth;
  editorModel: typeof editorModel;
  email: typeof email;
  fileStaging: typeof fileStaging;
  fileStagingActions: typeof fileStagingActions;
  folderExpansion: typeof folderExpansion;
  functions: typeof functions;
  gitOperations: typeof gitOperations;
  gitOperationsActions: typeof gitOperationsActions;
  github: typeof github;
  githubChecks: typeof githubChecks;
  githubOAuth: typeof githubOAuth;
  githubRepoApi: typeof githubRepoApi;
  http: typeof http;
  identityModel: typeof identityModel;
  infraProvisioning: typeof infraProvisioning;
  infraRead: typeof infraRead;
  infraReadPolicy: typeof infraReadPolicy;
  infraReadQueries: typeof infraReadQueries;
  jsonUtils: typeof jsonUtils;
  "mcp/contracts/getAuthenticationStatus": typeof mcp_contracts_getAuthenticationStatus;
  "mcp/grants": typeof mcp_grants;
  "mcp/http": typeof mcp_http;
  "mcp/model": typeof mcp_model;
  "mcp/oauth": typeof mcp_oauth;
  "mcp/protocol": typeof mcp_protocol;
  "mcp/scopes": typeof mcp_scopes;
  "mcp/tokens": typeof mcp_tokens;
  mcpTokenHealth: typeof mcpTokenHealth;
  newUserNotification: typeof newUserNotification;
  oauthState: typeof oauthState;
  oauthUtils: typeof oauthUtils;
  polarWebhooks: typeof polarWebhooks;
  providerApiLog: typeof providerApiLog;
  providerConnectionModel: typeof providerConnectionModel;
  providerConnections: typeof providerConnections;
  repositoryRefresh: typeof repositoryRefresh;
  repositoryRefreshModel: typeof repositoryRefreshModel;
  slugUtils: typeof slugUtils;
  stagingChanges: typeof stagingChanges;
  stagingRebase: typeof stagingRebase;
  starterSeed: typeof starterSeed;
  "toolRuntime/actionCatalog": typeof toolRuntime_actionCatalog;
  "toolRuntime/convexSchemas": typeof toolRuntime_convexSchemas;
  "toolRuntime/mcpScopes": typeof toolRuntime_mcpScopes;
  "toolRuntime/runtime": typeof toolRuntime_runtime;
  usageAttribution: typeof usageAttribution;
  userAccess: typeof userAccess;
  userPreferenceModel: typeof userPreferenceModel;
  users: typeof users;
  "vault/actions": typeof vault_actions;
  "vault/branchCommitSummary": typeof vault_branchCommitSummary;
  "vault/branchModel": typeof vault_branchModel;
  "vault/branches": typeof vault_branches;
  "vault/cloudflare": typeof vault_cloudflare;
  "vault/cloudflareMutations": typeof vault_cloudflareMutations;
  "vault/contracts/cloudflareConnectExistingWorker": typeof vault_contracts_cloudflareConnectExistingWorker;
  "vault/contracts/cloudflareListAccounts": typeof vault_contracts_cloudflareListAccounts;
  "vault/contracts/cloudflareListWorkers": typeof vault_contracts_cloudflareListWorkers;
  "vault/contracts/cloudflareVerifyInfrastructure": typeof vault_contracts_cloudflareVerifyInfrastructure;
  "vault/contracts/cloudflareWireBuilds": typeof vault_contracts_cloudflareWireBuilds;
  "vault/contracts/cloudflareWireConvexBuildAccess": typeof vault_contracts_cloudflareWireConvexBuildAccess;
  "vault/contracts/connectRepository": typeof vault_contracts_connectRepository;
  "vault/contracts/convexConnectExistingProject": typeof vault_contracts_convexConnectExistingProject;
  "vault/contracts/convexListProjects": typeof vault_contracts_convexListProjects;
  "vault/contracts/createRepository": typeof vault_contracts_createRepository;
  "vault/contracts/getUserVaults": typeof vault_contracts_getUserVaults;
  "vault/contracts/retryInfrastructureProvisioning": typeof vault_contracts_retryInfrastructureProvisioning;
  "vault/convex": typeof vault_convex;
  "vault/convexDeployKeys": typeof vault_convexDeployKeys;
  "vault/convexMutations": typeof vault_convexMutations;
  "vault/convexSchemaGraph": typeof vault_convexSchemaGraph;
  "vault/convexSchemaGraphModel": typeof vault_convexSchemaGraphModel;
  "vault/dashboard": typeof vault_dashboard;
  "vault/dashboardModel": typeof vault_dashboardModel;
  "vault/database": typeof vault_database;
  "vault/deletion/cleanup": typeof vault_deletion_cleanup;
  "vault/deletion/eligibility": typeof vault_deletion_eligibility;
  "vault/deletion/events": typeof vault_deletion_events;
  "vault/deletion/model": typeof vault_deletion_model;
  "vault/deletion/providerActions": typeof vault_deletion_providerActions;
  "vault/deletion/runs": typeof vault_deletion_runs;
  "vault/deletion/state": typeof vault_deletion_state;
  "vault/deletion/workflow": typeof vault_deletion_workflow;
  "vault/model": typeof vault_model;
  "vault/providerResourceObservationModel": typeof vault_providerResourceObservationModel;
  "vault/providerResourceObservationTargets": typeof vault_providerResourceObservationTargets;
  "vault/providerResourceObservations": typeof vault_providerResourceObservations;
  "vault/records": typeof vault_records;
  "vault/state": typeof vault_state;
  viewerRole: typeof viewerRole;
  workspaceSidebarState: typeof workspaceSidebarState;
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
