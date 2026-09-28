/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountDeletion_authCleanup from "../accountDeletion/authCleanup.js";
import type * as accountDeletion_cleanup from "../accountDeletion/cleanup.js";
import type * as accountDeletion_completionEmail from "../accountDeletion/completionEmail.js";
import type * as accountDeletion_index from "../accountDeletion/index.js";
import type * as accountDeletion_model from "../accountDeletion/model.js";
import type * as accountDeletion_providerActions from "../accountDeletion/providerActions.js";
import type * as accountDeletion_stepContext from "../accountDeletion/stepContext.js";
import type * as accountDeletion_workflow from "../accountDeletion/workflow.js";
import type * as agentBrowserHandoff from "../agentBrowserHandoff.js";
import type * as agentBrowserHandoff_contracts_createBrowserHandoff from "../agentBrowserHandoff/contracts/createBrowserHandoff.js";
import type * as auth from "../auth.js";
import type * as authAdmin from "../authAdmin.js";
import type * as billing from "../billing.js";
import type * as billingResourceQuotas from "../billingResourceQuotas.js";
import type * as cloudflare_mcpClient from "../cloudflare/mcpClient.js";
import type * as cloudflare_mcpTokenHealth from "../cloudflare/mcpTokenHealth.js";
import type * as cloudflare_resources from "../cloudflare/resources.js";
import type * as cloudflareAccountDiscovery from "../cloudflareAccountDiscovery.js";
import type * as cloudflareApi_client from "../cloudflareApi/client.js";
import type * as cloudflareApi_fixtures_observedWorkerBuilds from "../cloudflareApi/fixtures/observedWorkerBuilds.js";
import type * as cloudflareApi_fixtures_observedWorkerErrors from "../cloudflareApi/fixtures/observedWorkerErrors.js";
import type * as cloudflareBuildTokens from "../cloudflareBuildTokens.js";
import type * as cloudflareMcpOAuth from "../cloudflareMcpOAuth.js";
import type * as cloudflareOAuth from "../cloudflareOAuth.js";
import type * as cloudflareProviderAccess from "../cloudflareProviderAccess.js";
import type * as collaborative from "../collaborative.js";
import type * as convexDeploymentRegionModel from "../convexDeploymentRegionModel.js";
import type * as convexDeploymentRegions from "../convexDeploymentRegions.js";
import type * as convexManagementApi_client from "../convexManagementApi/client.js";
import type * as convexManagementApi_errors from "../convexManagementApi/errors.js";
import type * as convexManagementApi_oauthToken from "../convexManagementApi/oauthToken.js";
import type * as convexOAuth from "../convexOAuth.js";
import type * as convexProviderAccess from "../convexProviderAccess.js";
import type * as dashboardSettings from "../dashboardSettings.js";
import type * as deploymentProfile from "../deploymentProfile.js";
import type * as devAuth from "../devAuth.js";
import type * as email from "../email.js";
import type * as fileStaging from "../fileStaging.js";
import type * as fileStagingActions from "../fileStagingActions.js";
import type * as folderExpansion from "../folderExpansion.js";
import type * as functions from "../functions.js";
import type * as gitOperations from "../gitOperations.js";
import type * as github from "../github.js";
import type * as githubApi_app from "../githubApi/app.js";
import type * as githubApi_blobContent from "../githubApi/blobContent.js";
import type * as githubApi_repository from "../githubApi/repository.js";
import type * as githubAppAccess from "../githubAppAccess.js";
import type * as githubAppConnection from "../githubAppConnection.js";
import type * as githubAppInstallation from "../githubAppInstallation.js";
import type * as githubChecks from "../githubChecks.js";
import type * as githubUserAuthorizations from "../githubUserAuthorizations.js";
import type * as http from "../http.js";
import type * as identity_access from "../identity/access.js";
import type * as identity_accessValidators from "../identity/accessValidators.js";
import type * as identity_accountLinking from "../identity/accountLinking.js";
import type * as identity_accountModel from "../identity/accountModel.js";
import type * as identity_githubSignIn from "../identity/githubSignIn.js";
import type * as identity_githubUserAuthorizationModel from "../identity/githubUserAuthorizationModel.js";
import type * as identity_lifecycle from "../identity/lifecycle.js";
import type * as identity_model from "../identity/model.js";
import type * as identity_newUserNotification from "../identity/newUserNotification.js";
import type * as identity_preferenceModel from "../identity/preferenceModel.js";
import type * as identity_viewerRole from "../identity/viewerRole.js";
import type * as infraProvisioning from "../infraProvisioning.js";
import type * as lib_concurrency from "../lib/concurrency.js";
import type * as lib_json from "../lib/json.js";
import type * as lib_oauth from "../lib/oauth.js";
import type * as lib_slug from "../lib/slug.js";
import type * as logging_providerApiLog from "../logging/providerApiLog.js";
import type * as logging_providerResponseValidation from "../logging/providerResponseValidation.js";
import type * as logging_usageAttribution from "../logging/usageAttribution.js";
import type * as mcp_client from "../mcp/client.js";
import type * as mcp_contracts_getAuthenticationStatus from "../mcp/contracts/getAuthenticationStatus.js";
import type * as mcp_contracts_submitFeedback from "../mcp/contracts/submitFeedback.js";
import type * as mcp_feedback from "../mcp/feedback.js";
import type * as mcp_grants from "../mcp/grants.js";
import type * as mcp_http from "../mcp/http.js";
import type * as mcp_model from "../mcp/model.js";
import type * as mcp_oauth from "../mcp/oauth.js";
import type * as mcp_protocol from "../mcp/protocol.js";
import type * as mcp_scopes from "../mcp/scopes.js";
import type * as mcp_tokens from "../mcp/tokens.js";
import type * as oauthState from "../oauthState.js";
import type * as organization_billingAccounts from "../organization/billingAccounts.js";
import type * as organization_billingErrors from "../organization/billingErrors.js";
import type * as organization_billingLimits from "../organization/billingLimits.js";
import type * as organization_githubAppSetupModel from "../organization/githubAppSetupModel.js";
import type * as organization_invitationModel from "../organization/invitationModel.js";
import type * as organization_memberGitHub from "../organization/memberGitHub.js";
import type * as organization_model from "../organization/model.js";
import type * as organization_providerCredentialModel from "../organization/providerCredentialModel.js";
import type * as organizationAccess from "../organizationAccess.js";
import type * as organizationAdmin from "../organizationAdmin.js";
import type * as organizationMembers from "../organizationMembers.js";
import type * as organizationProviderCredentials from "../organizationProviderCredentials.js";
import type * as organizations from "../organizations.js";
import type * as polar_client from "../polar/client.js";
import type * as polarBillingState from "../polarBillingState.js";
import type * as polarCheckout from "../polarCheckout.js";
import type * as polarWebhooks from "../polarWebhooks.js";
import type * as previewSeedAccount from "../previewSeedAccount.js";
import type * as providers_auth from "../providers/auth.js";
import type * as providers_authFingerprint from "../providers/authFingerprint.js";
import type * as providers_authorizationCompletion from "../providers/authorizationCompletion.js";
import type * as repository_actions from "../repository/actions.js";
import type * as repository_branchModel from "../repository/branchModel.js";
import type * as repository_branches from "../repository/branches.js";
import type * as repository_cloudflare from "../repository/cloudflare.js";
import type * as repository_cloudflareBuildMatching from "../repository/cloudflareBuildMatching.js";
import type * as repository_cloudflareMutations from "../repository/cloudflareMutations.js";
import type * as repository_contracts_cloudflareAttachments from "../repository/contracts/cloudflareAttachments.js";
import type * as repository_contracts_cloudflareBuildTokens from "../repository/contracts/cloudflareBuildTokens.js";
import type * as repository_contracts_cloudflareConfigureWorkersBuildsForGitHub from "../repository/contracts/cloudflareConfigureWorkersBuildsForGitHub.js";
import type * as repository_contracts_cloudflareRotateConvexDeployKeysForWorkersBuilds from "../repository/contracts/cloudflareRotateConvexDeployKeysForWorkersBuilds.js";
import type * as repository_contracts_connectRepository from "../repository/contracts/connectRepository.js";
import type * as repository_contracts_convexAttachments from "../repository/contracts/convexAttachments.js";
import type * as repository_contracts_createRepository from "../repository/contracts/createRepository.js";
import type * as repository_contracts_getUserRepositories from "../repository/contracts/getUserRepositories.js";
import type * as repository_contracts_retryInfrastructureProvisioning from "../repository/contracts/retryInfrastructureProvisioning.js";
import type * as repository_convex from "../repository/convex.js";
import type * as repository_convexDeployKeys from "../repository/convexDeployKeys.js";
import type * as repository_convexMutations from "../repository/convexMutations.js";
import type * as repository_convexProjectResources from "../repository/convexProjectResources.js";
import type * as repository_convexSchemaGraph from "../repository/convexSchemaGraph.js";
import type * as repository_convexSchemaGraphModel from "../repository/convexSchemaGraphModel.js";
import type * as repository_dashboard from "../repository/dashboard.js";
import type * as repository_dashboardModel from "../repository/dashboardModel.js";
import type * as repository_database from "../repository/database.js";
import type * as repository_deletion_cleanup from "../repository/deletion/cleanup.js";
import type * as repository_deletion_eligibility from "../repository/deletion/eligibility.js";
import type * as repository_deletion_events from "../repository/deletion/events.js";
import type * as repository_deletion_model from "../repository/deletion/model.js";
import type * as repository_deletion_providerActions from "../repository/deletion/providerActions.js";
import type * as repository_deletion_runs from "../repository/deletion/runs.js";
import type * as repository_deletion_state from "../repository/deletion/state.js";
import type * as repository_deletion_workflow from "../repository/deletion/workflow.js";
import type * as repository_editorModel from "../repository/editorModel.js";
import type * as repository_eventOrderModel from "../repository/eventOrderModel.js";
import type * as repository_folderModel from "../repository/folderModel.js";
import type * as repository_folders from "../repository/folders.js";
import type * as repository_infrastructureOperation from "../repository/infrastructureOperation.js";
import type * as repository_model from "../repository/model.js";
import type * as repository_organizationTree from "../repository/organizationTree.js";
import type * as repository_organizationTreeModel from "../repository/organizationTreeModel.js";
import type * as repository_providerDashboardUrls from "../repository/providerDashboardUrls.js";
import type * as repository_providerObservationQueries from "../repository/providerObservationQueries.js";
import type * as repository_providerObservations from "../repository/providerObservations.js";
import type * as repository_provisioningModel from "../repository/provisioningModel.js";
import type * as repository_pullRequestCloudflareWorkerChecks from "../repository/pullRequestCloudflareWorkerChecks.js";
import type * as repository_pullRequestCloudflareWorkerComments from "../repository/pullRequestCloudflareWorkerComments.js";
import type * as repository_pullRequestCloudflareWorkerProof from "../repository/pullRequestCloudflareWorkerProof.js";
import type * as repository_pullRequestHostingPreviews from "../repository/pullRequestHostingPreviews.js";
import type * as repository_pullRequestResources from "../repository/pullRequestResources.js";
import type * as repository_records from "../repository/records.js";
import type * as repository_state from "../repository/state.js";
import type * as repository_workersBuildsConvexDeployKeyNames from "../repository/workersBuildsConvexDeployKeyNames.js";
import type * as repositoryProvisioningEvents from "../repositoryProvisioningEvents.js";
import type * as repositoryProvisioningRuns from "../repositoryProvisioningRuns.js";
import type * as repositoryProvisioningWorkflow from "../repositoryProvisioningWorkflow.js";
import type * as repositoryProvisioningWorkflowActions from "../repositoryProvisioningWorkflowActions.js";
import type * as repositoryPullRequests from "../repositoryPullRequests.js";
import type * as repositoryWorkflowAuthority from "../repositoryWorkflowAuthority.js";
import type * as staging_rebase from "../staging/rebase.js";
import type * as starterSeed from "../starterSeed.js";
import type * as toolRuntime_actionCatalog from "../toolRuntime/actionCatalog.js";
import type * as toolRuntime_convexSchemas from "../toolRuntime/convexSchemas.js";
import type * as toolRuntime_mcpScopes from "../toolRuntime/mcpScopes.js";
import type * as toolRuntime_runtime from "../toolRuntime/runtime.js";
import type * as users from "../users.js";
import type * as workspaceSidebarState from "../workspaceSidebarState.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "accountDeletion/authCleanup": typeof accountDeletion_authCleanup;
  "accountDeletion/cleanup": typeof accountDeletion_cleanup;
  "accountDeletion/completionEmail": typeof accountDeletion_completionEmail;
  "accountDeletion/index": typeof accountDeletion_index;
  "accountDeletion/model": typeof accountDeletion_model;
  "accountDeletion/providerActions": typeof accountDeletion_providerActions;
  "accountDeletion/stepContext": typeof accountDeletion_stepContext;
  "accountDeletion/workflow": typeof accountDeletion_workflow;
  agentBrowserHandoff: typeof agentBrowserHandoff;
  "agentBrowserHandoff/contracts/createBrowserHandoff": typeof agentBrowserHandoff_contracts_createBrowserHandoff;
  auth: typeof auth;
  authAdmin: typeof authAdmin;
  billing: typeof billing;
  billingResourceQuotas: typeof billingResourceQuotas;
  "cloudflare/mcpClient": typeof cloudflare_mcpClient;
  "cloudflare/mcpTokenHealth": typeof cloudflare_mcpTokenHealth;
  "cloudflare/resources": typeof cloudflare_resources;
  cloudflareAccountDiscovery: typeof cloudflareAccountDiscovery;
  "cloudflareApi/client": typeof cloudflareApi_client;
  "cloudflareApi/fixtures/observedWorkerBuilds": typeof cloudflareApi_fixtures_observedWorkerBuilds;
  "cloudflareApi/fixtures/observedWorkerErrors": typeof cloudflareApi_fixtures_observedWorkerErrors;
  cloudflareBuildTokens: typeof cloudflareBuildTokens;
  cloudflareMcpOAuth: typeof cloudflareMcpOAuth;
  cloudflareOAuth: typeof cloudflareOAuth;
  cloudflareProviderAccess: typeof cloudflareProviderAccess;
  collaborative: typeof collaborative;
  convexDeploymentRegionModel: typeof convexDeploymentRegionModel;
  convexDeploymentRegions: typeof convexDeploymentRegions;
  "convexManagementApi/client": typeof convexManagementApi_client;
  "convexManagementApi/errors": typeof convexManagementApi_errors;
  "convexManagementApi/oauthToken": typeof convexManagementApi_oauthToken;
  convexOAuth: typeof convexOAuth;
  convexProviderAccess: typeof convexProviderAccess;
  dashboardSettings: typeof dashboardSettings;
  deploymentProfile: typeof deploymentProfile;
  devAuth: typeof devAuth;
  email: typeof email;
  fileStaging: typeof fileStaging;
  fileStagingActions: typeof fileStagingActions;
  folderExpansion: typeof folderExpansion;
  functions: typeof functions;
  gitOperations: typeof gitOperations;
  github: typeof github;
  "githubApi/app": typeof githubApi_app;
  "githubApi/blobContent": typeof githubApi_blobContent;
  "githubApi/repository": typeof githubApi_repository;
  githubAppAccess: typeof githubAppAccess;
  githubAppConnection: typeof githubAppConnection;
  githubAppInstallation: typeof githubAppInstallation;
  githubChecks: typeof githubChecks;
  githubUserAuthorizations: typeof githubUserAuthorizations;
  http: typeof http;
  "identity/access": typeof identity_access;
  "identity/accessValidators": typeof identity_accessValidators;
  "identity/accountLinking": typeof identity_accountLinking;
  "identity/accountModel": typeof identity_accountModel;
  "identity/githubSignIn": typeof identity_githubSignIn;
  "identity/githubUserAuthorizationModel": typeof identity_githubUserAuthorizationModel;
  "identity/lifecycle": typeof identity_lifecycle;
  "identity/model": typeof identity_model;
  "identity/newUserNotification": typeof identity_newUserNotification;
  "identity/preferenceModel": typeof identity_preferenceModel;
  "identity/viewerRole": typeof identity_viewerRole;
  infraProvisioning: typeof infraProvisioning;
  "lib/concurrency": typeof lib_concurrency;
  "lib/json": typeof lib_json;
  "lib/oauth": typeof lib_oauth;
  "lib/slug": typeof lib_slug;
  "logging/providerApiLog": typeof logging_providerApiLog;
  "logging/providerResponseValidation": typeof logging_providerResponseValidation;
  "logging/usageAttribution": typeof logging_usageAttribution;
  "mcp/client": typeof mcp_client;
  "mcp/contracts/getAuthenticationStatus": typeof mcp_contracts_getAuthenticationStatus;
  "mcp/contracts/submitFeedback": typeof mcp_contracts_submitFeedback;
  "mcp/feedback": typeof mcp_feedback;
  "mcp/grants": typeof mcp_grants;
  "mcp/http": typeof mcp_http;
  "mcp/model": typeof mcp_model;
  "mcp/oauth": typeof mcp_oauth;
  "mcp/protocol": typeof mcp_protocol;
  "mcp/scopes": typeof mcp_scopes;
  "mcp/tokens": typeof mcp_tokens;
  oauthState: typeof oauthState;
  "organization/billingAccounts": typeof organization_billingAccounts;
  "organization/billingErrors": typeof organization_billingErrors;
  "organization/billingLimits": typeof organization_billingLimits;
  "organization/githubAppSetupModel": typeof organization_githubAppSetupModel;
  "organization/invitationModel": typeof organization_invitationModel;
  "organization/memberGitHub": typeof organization_memberGitHub;
  "organization/model": typeof organization_model;
  "organization/providerCredentialModel": typeof organization_providerCredentialModel;
  organizationAccess: typeof organizationAccess;
  organizationAdmin: typeof organizationAdmin;
  organizationMembers: typeof organizationMembers;
  organizationProviderCredentials: typeof organizationProviderCredentials;
  organizations: typeof organizations;
  "polar/client": typeof polar_client;
  polarBillingState: typeof polarBillingState;
  polarCheckout: typeof polarCheckout;
  polarWebhooks: typeof polarWebhooks;
  previewSeedAccount: typeof previewSeedAccount;
  "providers/auth": typeof providers_auth;
  "providers/authFingerprint": typeof providers_authFingerprint;
  "providers/authorizationCompletion": typeof providers_authorizationCompletion;
  "repository/actions": typeof repository_actions;
  "repository/branchModel": typeof repository_branchModel;
  "repository/branches": typeof repository_branches;
  "repository/cloudflare": typeof repository_cloudflare;
  "repository/cloudflareBuildMatching": typeof repository_cloudflareBuildMatching;
  "repository/cloudflareMutations": typeof repository_cloudflareMutations;
  "repository/contracts/cloudflareAttachments": typeof repository_contracts_cloudflareAttachments;
  "repository/contracts/cloudflareBuildTokens": typeof repository_contracts_cloudflareBuildTokens;
  "repository/contracts/cloudflareConfigureWorkersBuildsForGitHub": typeof repository_contracts_cloudflareConfigureWorkersBuildsForGitHub;
  "repository/contracts/cloudflareRotateConvexDeployKeysForWorkersBuilds": typeof repository_contracts_cloudflareRotateConvexDeployKeysForWorkersBuilds;
  "repository/contracts/connectRepository": typeof repository_contracts_connectRepository;
  "repository/contracts/convexAttachments": typeof repository_contracts_convexAttachments;
  "repository/contracts/createRepository": typeof repository_contracts_createRepository;
  "repository/contracts/getUserRepositories": typeof repository_contracts_getUserRepositories;
  "repository/contracts/retryInfrastructureProvisioning": typeof repository_contracts_retryInfrastructureProvisioning;
  "repository/convex": typeof repository_convex;
  "repository/convexDeployKeys": typeof repository_convexDeployKeys;
  "repository/convexMutations": typeof repository_convexMutations;
  "repository/convexProjectResources": typeof repository_convexProjectResources;
  "repository/convexSchemaGraph": typeof repository_convexSchemaGraph;
  "repository/convexSchemaGraphModel": typeof repository_convexSchemaGraphModel;
  "repository/dashboard": typeof repository_dashboard;
  "repository/dashboardModel": typeof repository_dashboardModel;
  "repository/database": typeof repository_database;
  "repository/deletion/cleanup": typeof repository_deletion_cleanup;
  "repository/deletion/eligibility": typeof repository_deletion_eligibility;
  "repository/deletion/events": typeof repository_deletion_events;
  "repository/deletion/model": typeof repository_deletion_model;
  "repository/deletion/providerActions": typeof repository_deletion_providerActions;
  "repository/deletion/runs": typeof repository_deletion_runs;
  "repository/deletion/state": typeof repository_deletion_state;
  "repository/deletion/workflow": typeof repository_deletion_workflow;
  "repository/editorModel": typeof repository_editorModel;
  "repository/eventOrderModel": typeof repository_eventOrderModel;
  "repository/folderModel": typeof repository_folderModel;
  "repository/folders": typeof repository_folders;
  "repository/infrastructureOperation": typeof repository_infrastructureOperation;
  "repository/model": typeof repository_model;
  "repository/organizationTree": typeof repository_organizationTree;
  "repository/organizationTreeModel": typeof repository_organizationTreeModel;
  "repository/providerDashboardUrls": typeof repository_providerDashboardUrls;
  "repository/providerObservationQueries": typeof repository_providerObservationQueries;
  "repository/providerObservations": typeof repository_providerObservations;
  "repository/provisioningModel": typeof repository_provisioningModel;
  "repository/pullRequestCloudflareWorkerChecks": typeof repository_pullRequestCloudflareWorkerChecks;
  "repository/pullRequestCloudflareWorkerComments": typeof repository_pullRequestCloudflareWorkerComments;
  "repository/pullRequestCloudflareWorkerProof": typeof repository_pullRequestCloudflareWorkerProof;
  "repository/pullRequestHostingPreviews": typeof repository_pullRequestHostingPreviews;
  "repository/pullRequestResources": typeof repository_pullRequestResources;
  "repository/records": typeof repository_records;
  "repository/state": typeof repository_state;
  "repository/workersBuildsConvexDeployKeyNames": typeof repository_workersBuildsConvexDeployKeyNames;
  repositoryProvisioningEvents: typeof repositoryProvisioningEvents;
  repositoryProvisioningRuns: typeof repositoryProvisioningRuns;
  repositoryProvisioningWorkflow: typeof repositoryProvisioningWorkflow;
  repositoryProvisioningWorkflowActions: typeof repositoryProvisioningWorkflowActions;
  repositoryPullRequests: typeof repositoryPullRequests;
  repositoryWorkflowAuthority: typeof repositoryWorkflowAuthority;
  "staging/rebase": typeof staging_rebase;
  starterSeed: typeof starterSeed;
  "toolRuntime/actionCatalog": typeof toolRuntime_actionCatalog;
  "toolRuntime/convexSchemas": typeof toolRuntime_convexSchemas;
  "toolRuntime/mcpScopes": typeof toolRuntime_mcpScopes;
  "toolRuntime/runtime": typeof toolRuntime_runtime;
  users: typeof users;
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
