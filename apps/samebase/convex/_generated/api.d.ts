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
import type * as agentBrowserHandoff from "../agentBrowserHandoff.js";
import type * as agentBrowserHandoff_contracts_createBrowserHandoff from "../agentBrowserHandoff/contracts/createBrowserHandoff.js";
import type * as appProvisioningEvents from "../appProvisioningEvents.js";
import type * as appProvisioningModel from "../appProvisioningModel.js";
import type * as appProvisioningRuns from "../appProvisioningRuns.js";
import type * as appProvisioningWorkflow from "../appProvisioningWorkflow.js";
import type * as appProvisioningWorkflowActions from "../appProvisioningWorkflowActions.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as cloudflareAccountDiscovery from "../cloudflareAccountDiscovery.js";
import type * as cloudflareApi_client from "../cloudflareApi/client.js";
import type * as cloudflareMcp from "../cloudflareMcp.js";
import type * as cloudflareMcpOAuth from "../cloudflareMcpOAuth.js";
import type * as cloudflareOAuth from "../cloudflareOAuth.js";
import type * as cloudflareProviderAccess from "../cloudflareProviderAccess.js";
import type * as cloudflareResources from "../cloudflareResources.js";
import type * as collaborative from "../collaborative.js";
import type * as common from "../common.js";
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
import type * as repositoryPullRequests from "../repositoryPullRequests.js";
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
import type * as vault_branchModel from "../vault/branchModel.js";
import type * as vault_branches from "../vault/branches.js";
import type * as vault_cloudflare from "../vault/cloudflare.js";
import type * as vault_cloudflareMutations from "../vault/cloudflareMutations.js";
import type * as vault_contracts_cloudflareAttachments from "../vault/contracts/cloudflareAttachments.js";
import type * as vault_contracts_cloudflareConfigureWorkersBuildsForGitHub from "../vault/contracts/cloudflareConfigureWorkersBuildsForGitHub.js";
import type * as vault_contracts_cloudflareListAccounts from "../vault/contracts/cloudflareListAccounts.js";
import type * as vault_contracts_cloudflareRotateConvexDeployKeysForWorkersBuilds from "../vault/contracts/cloudflareRotateConvexDeployKeysForWorkersBuilds.js";
import type * as vault_contracts_connectRepository from "../vault/contracts/connectRepository.js";
import type * as vault_contracts_convexAttachments from "../vault/contracts/convexAttachments.js";
import type * as vault_contracts_createRepository from "../vault/contracts/createRepository.js";
import type * as vault_contracts_getUserVaults from "../vault/contracts/getUserVaults.js";
import type * as vault_contracts_retryInfrastructureProvisioning from "../vault/contracts/retryInfrastructureProvisioning.js";
import type * as vault_convex from "../vault/convex.js";
import type * as vault_convexDeployKeys from "../vault/convexDeployKeys.js";
import type * as vault_convexMutations from "../vault/convexMutations.js";
import type * as vault_convexProjectResources from "../vault/convexProjectResources.js";
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
import type * as vault_providerObservationQueries from "../vault/providerObservationQueries.js";
import type * as vault_providerObservations from "../vault/providerObservations.js";
import type * as vault_pullRequestResources from "../vault/pullRequestResources.js";
import type * as vault_records from "../vault/records.js";
import type * as vault_state from "../vault/state.js";
import type * as vault_workersBuildsConvexDeployKeyNames from "../vault/workersBuildsConvexDeployKeyNames.js";
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
  agentBrowserHandoff: typeof agentBrowserHandoff;
  "agentBrowserHandoff/contracts/createBrowserHandoff": typeof agentBrowserHandoff_contracts_createBrowserHandoff;
  appProvisioningEvents: typeof appProvisioningEvents;
  appProvisioningModel: typeof appProvisioningModel;
  appProvisioningRuns: typeof appProvisioningRuns;
  appProvisioningWorkflow: typeof appProvisioningWorkflow;
  appProvisioningWorkflowActions: typeof appProvisioningWorkflowActions;
  auth: typeof auth;
  billing: typeof billing;
  cloudflareAccountDiscovery: typeof cloudflareAccountDiscovery;
  "cloudflareApi/client": typeof cloudflareApi_client;
  cloudflareMcp: typeof cloudflareMcp;
  cloudflareMcpOAuth: typeof cloudflareMcpOAuth;
  cloudflareOAuth: typeof cloudflareOAuth;
  cloudflareProviderAccess: typeof cloudflareProviderAccess;
  cloudflareResources: typeof cloudflareResources;
  collaborative: typeof collaborative;
  common: typeof common;
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
  repositoryPullRequests: typeof repositoryPullRequests;
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
  "vault/branchModel": typeof vault_branchModel;
  "vault/branches": typeof vault_branches;
  "vault/cloudflare": typeof vault_cloudflare;
  "vault/cloudflareMutations": typeof vault_cloudflareMutations;
  "vault/contracts/cloudflareAttachments": typeof vault_contracts_cloudflareAttachments;
  "vault/contracts/cloudflareConfigureWorkersBuildsForGitHub": typeof vault_contracts_cloudflareConfigureWorkersBuildsForGitHub;
  "vault/contracts/cloudflareListAccounts": typeof vault_contracts_cloudflareListAccounts;
  "vault/contracts/cloudflareRotateConvexDeployKeysForWorkersBuilds": typeof vault_contracts_cloudflareRotateConvexDeployKeysForWorkersBuilds;
  "vault/contracts/connectRepository": typeof vault_contracts_connectRepository;
  "vault/contracts/convexAttachments": typeof vault_contracts_convexAttachments;
  "vault/contracts/createRepository": typeof vault_contracts_createRepository;
  "vault/contracts/getUserVaults": typeof vault_contracts_getUserVaults;
  "vault/contracts/retryInfrastructureProvisioning": typeof vault_contracts_retryInfrastructureProvisioning;
  "vault/convex": typeof vault_convex;
  "vault/convexDeployKeys": typeof vault_convexDeployKeys;
  "vault/convexMutations": typeof vault_convexMutations;
  "vault/convexProjectResources": typeof vault_convexProjectResources;
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
  "vault/providerObservationQueries": typeof vault_providerObservationQueries;
  "vault/providerObservations": typeof vault_providerObservations;
  "vault/pullRequestResources": typeof vault_pullRequestResources;
  "vault/records": typeof vault_records;
  "vault/state": typeof vault_state;
  "vault/workersBuildsConvexDeployKeyNames": typeof vault_workersBuildsConvexDeployKeyNames;
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
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
