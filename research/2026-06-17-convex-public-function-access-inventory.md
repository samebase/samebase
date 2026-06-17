# Convex Public Function Access Inventory

Date: 2026-06-17

This is a migration worksheet for the access-wrapper rollout from
`rfcs/085_ACCESS_MODEL_ROLES_AND_GRANTS_SPEC.md`. It is not the policy source of truth. After a
function is migrated, the durable access decision lives on that function's wrapper declaration as
`access: "access_*"`.

Inventory method: exported public `query`, `mutation`, and `action` calls in `apps/noter/convex`,
excluding `_generated`, test files, `.d.ts`, and `starterSeedManifest.generated.ts`. Internal
functions and HTTP actions are separate surfaces and are not counted here.

Summary:

- Public functions: 139
- Already wrapped: 3
- Pending access decision: 136

| Module                           | Function                                     | Kind     | Line | Current access       | Decision | Notes |
| -------------------------------- | -------------------------------------------- | -------- | ---: | -------------------- | -------- | ----- |
| `agentGraphActions.ts`           | `sendAgentMessage`                           | action   |  152 |                      | TBD      |       |
| `agentGraphLayout.ts`            | `getNodeLayouts`                             | query    |   32 |                      | TBD      |       |
| `agentGraphLayout.ts`            | `setNodeLayout`                              | mutation |   58 |                      | TBD      |       |
| `appProvisioningEvents.ts`       | `listForVault`                               | query    |   66 |                      | TBD      |       |
| `billing.ts`                     | `getViewerBillingStatus`                     | query    |  175 |                      | TBD      |       |
| `billing.ts`                     | `createPolarCheckoutSession`                 | action   |  257 |                      | TBD      |       |
| `billing.ts`                     | `createPolarCustomerPortalSession`           | action   |  324 |                      | TBD      |       |
| `billing.ts`                     | `syncViewerBillingFromPolar`                 | action   |  433 |                      | TBD      |       |
| `chat/index.ts`                  | `createThread`                               | mutation |   49 |                      | TBD      |       |
| `chat/index.ts`                  | `getThreadForVault`                          | query    |  102 |                      | TBD      |       |
| `chat/index.ts`                  | `getThreadContext`                           | query    |  122 |                      | TBD      |       |
| `chat/index.ts`                  | `deleteThread`                               | mutation |  154 |                      | TBD      |       |
| `chat/index.ts`                  | `sendMessage`                                | mutation |  180 |                      | TBD      |       |
| `chat/index.ts`                  | `updateThreadDraft`                          | mutation |  217 |                      | TBD      |       |
| `chat/index.ts`                  | `listThreadMessages`                         | query    |  261 |                      | TBD      |       |
| `chat/index.ts`                  | `proposeProdRead`                            | mutation |  314 |                      | TBD      |       |
| `chat/index.ts`                  | `rejectProdRead`                             | mutation |  438 |                      | TBD      |       |
| `chat/index.ts`                  | `confirmProdRead`                            | mutation |  497 |                      | TBD      |       |
| `chat/index.ts`                  | `confirmCommit`                              | mutation |  595 |                      | TBD      |       |
| `cloudflareMcpOAuth.ts`          | `getCloudflareMcpOAuthUrl`                   | action   |  548 |                      | TBD      |       |
| `codespaces/executor.ts`         | `executeCommand`                             | action   |   64 |                      | TBD      |       |
| `codespaces/executor.ts`         | `writeFileToCodespace`                       | action   |  120 |                      | TBD      |       |
| `codespaces/executor.ts`         | `readFileFromCodespace`                      | action   |  173 |                      | TBD      |       |
| `codespaces/executor.ts`         | `listFiles`                                  | action   |  229 |                      | TBD      |       |
| `codespaces/executor.ts`         | `deleteFile`                                 | action   |  280 |                      | TBD      |       |
| `codespaces/executor.ts`         | `getFileStat`                                | action   |  337 |                      | TBD      |       |
| `codespaces/executor.ts`         | `checkAgentHealth`                           | action   |  388 |                      | TBD      |       |
| `codespaces/executor.ts`         | `getCodexStatus`                             | action   | 1396 |                      | TBD      |       |
| `codespaces/executor.ts`         | `ensureCodexRuntime`                         | action   | 1413 |                      | TBD      |       |
| `codespaces/executor.ts`         | `startCodexThread`                           | action   | 1448 |                      | TBD      |       |
| `codespaces/executor.ts`         | `startCodexTurn`                             | action   | 1497 |                      | TBD      |       |
| `codespaces/executor.ts`         | `getCodexEvents`                             | action   | 1547 |                      | TBD      |       |
| `codespaces/index.ts`            | `createCodespace`                            | action   |   52 |                      | TBD      |       |
| `codespaces/index.ts`            | `getCodespaceConnection`                     | action   |  244 |                      | TBD      |       |
| `codespaces/index.ts`            | `startCodespace`                             | action   |  278 |                      | TBD      |       |
| `codespaces/index.ts`            | `stopCodespace`                              | action   |  348 |                      | TBD      |       |
| `codespaces/index.ts`            | `deleteCodespace`                            | action   |  392 |                      | TBD      |       |
| `codespaces/mutations.ts`        | `getActiveCodespace`                         | query    |  205 |                      | TBD      |       |
| `codespaces/mutations.ts`        | `getConnectedCodespacesCount`                | query    |  302 |                      | TBD      |       |
| `codespaces/ports.ts`            | `ensureCodespacePortsVisibility`             | action   |  434 |                      | TBD      |       |
| `codespaces/vaultIntegration.ts` | `createVaultWithCodespace`                   | action   |   31 |                      | TBD      |       |
| `codespaces/vaultIntegration.ts` | `rebuildCodespaceIfStale`                    | action   |  195 |                      | TBD      |       |
| `codespaces/vaultIntegration.ts` | `ensureCodespaceReady`                       | action   |  275 |                      | TBD      |       |
| `collaborative.ts`               | `getDocument`                                | query    |   32 |                      | TBD      |       |
| `collaborative.ts`               | `pullUpdates`                                | query    |   86 |                      | TBD      |       |
| `collaborative.ts`               | `pushUpdates`                                | mutation |  139 |                      | TBD      |       |
| `collaborative.ts`               | `getActiveEditors`                           | query    |  474 |                      | TBD      |       |
| `connectedMachineControl.ts`     | `issueMachineControlToken`                   | mutation |   19 |                      | TBD      |       |
| `connectedMachines.ts`           | `listConnectedMachines`                      | query    |  113 |                      | TBD      |       |
| `connectedMachines.ts`           | `getMachineRegistrationRequestForBrowser`    | query    |  135 |                      | TBD      |       |
| `connectedMachines.ts`           | `approveMachineRegistrationRequest`          | mutation |  173 |                      | TBD      |       |
| `convexOAuth.ts`                 | `getConvexOAuthUrl`                          | mutation |  189 |                      | TBD      |       |
| `dashboardSettings.ts`           | `getDashboardSettings`                       | query    |   93 |                      | TBD      |       |
| `dashboardSettings.ts`           | `setAccountPanelOpen`                        | mutation |  123 |                      | TBD      |       |
| `dashboardSettings.ts`           | `setProvidersPanelOpen`                      | mutation |  140 |                      | TBD      |       |
| `dashboardSettings.ts`           | `setPricingBillingCycle`                     | mutation |  157 |                      | TBD      |       |
| `dashboardSettings.ts`           | `setEditorChatOpen`                          | mutation |  174 |                      | TBD      |       |
| `deploymentProfile.ts`           | `getPublicDeploymentAuthPolicy`              | query    |  214 | `access_public`      | TBD      |       |
| `fileStaging.ts`                 | `generateUploadUrl`                          | mutation |  391 |                      | TBD      |       |
| `fileStaging.ts`                 | `deletePendingUploadBlob`                    | mutation |  412 |                      | TBD      |       |
| `fileStaging.ts`                 | `getByNewPath`                               | query    |  452 |                      | TBD      |       |
| `fileStaging.ts`                 | `listStagedFiles`                            | query    |  481 |                      | TBD      |       |
| `fileStaging.ts`                 | `listStagedFilesBranchSummaries`             | query    |  506 |                      | TBD      |       |
| `fileStaging.ts`                 | `clearAllStaging`                            | mutation |  836 |                      | TBD      |       |
| `fileStaging.ts`                 | `markFileForDeletion`                        | mutation |  953 |                      | TBD      |       |
| `fileStaging.ts`                 | `createFileInStaging`                        | mutation | 1007 |                      | TBD      |       |
| `fileStaging.ts`                 | `revertDeletedFileInStaging`                 | mutation | 1081 |                      | TBD      |       |
| `fileStaging.ts`                 | `updateStagedFileContent`                    | mutation | 1123 |                      | TBD      |       |
| `fileStagingActions.ts`          | `renameFileInStaging`                        | action   | 1837 |                      | TBD      |       |
| `fileStagingActions.ts`          | `getFileForEditing`                          | action   | 1891 |                      | TBD      |       |
| `fileStagingActions.ts`          | `stageUploadedMedia`                         | action   | 2084 |                      | TBD      |       |
| `fileStagingActions.ts`          | `commitStaging`                              | action   | 2148 |                      | TBD      |       |
| `fileStagingActions.ts`          | `createDraftPullRequest`                     | action   | 2178 |                      | TBD      |       |
| `fileStagingActions.ts`          | `createDraftPullRequestFromDefaultBranch`    | action   | 2341 |                      | TBD      |       |
| `fileStagingActions.ts`          | `pullFromGitHub`                             | action   | 2553 |                      | TBD      |       |
| `fileStagingActions.ts`          | `batchReadFiles`                             | action   | 2867 |                      | TBD      |       |
| `fileStagingActions.ts`          | `getCommitPreview`                           | action   | 3032 |                      | TBD      |       |
| `fileStagingActions.ts`          | `getBranchComparePreview`                    | action   | 3092 |                      | TBD      |       |
| `fileStagingActions.ts`          | `restoreComparedDeletedFileToStaging`        | action   | 3251 |                      | TBD      |       |
| `fileStagingActions.ts`          | `getRebaseConflictPreview`                   | action   | 3340 |                      | TBD      |       |
| `fileStagingActions.ts`          | `getRebaseConflictBundle`                    | action   | 3398 |                      | TBD      |       |
| `folderExpansion.ts`             | `getFolderExpansionStates`                   | query    |    8 |                      | TBD      |       |
| `folderExpansion.ts`             | `setFolderExpansionState`                    | mutation |   39 |                      | TBD      |       |
| `folderExpansion.ts`             | `clearFolderExpansionStates`                 | mutation |   82 |                      | TBD      |       |
| `github.ts`                      | `listRepositoriesPreview`                    | action   |  752 |                      | TBD      |       |
| `github.ts`                      | `listRepositories`                           | action   |  771 |                      | TBD      |       |
| `github.ts`                      | `getRepositoryFileContent`                   | action   | 1884 |                      | TBD      |       |
| `github.ts`                      | `getRepositoryMediaAsset`                    | action   | 1978 |                      | TBD      |       |
| `github.ts`                      | `refreshRepositoryTree`                      | action   | 2370 |                      | TBD      |       |
| `githubChecks.ts`                | `getCommitStatus`                            | action   |  185 |                      | TBD      |       |
| `githubOAuth.ts`                 | `getGithubOAuthUrl`                          | mutation |  152 |                      | TBD      |       |
| `mcp/oauth.ts`                   | `getAuthorizationRequestForCurrentUser`      | query    |  324 |                      | TBD      |       |
| `mcp/oauth.ts`                   | `completeAuthorizationRequestForCurrentUser` | action   |  639 |                      | TBD      |       |
| `mcp/oauth.ts`                   | `denyAuthorizationRequestForCurrentUser`     | action   |  681 |                      | TBD      |       |
| `repositoryRefresh.ts`           | `enqueueDashboardRepositoryRefresh`          | mutation |  950 | `access_app_refresh` | TBD      |       |
| `repositoryRefresh.ts`           | `enqueueManualRepositoryRefresh`             | mutation |  993 | `access_app_refresh` | TBD      |       |
| `users.ts`                       | `viewer`                                     | query    |  240 |                      | TBD      |       |
| `users.ts`                       | `getViewerAuthProviders`                     | query    |  286 |                      | TBD      |       |
| `users.ts`                       | `isCurrentUserApproved`                      | query    |  336 |                      | TBD      |       |
| `users.ts`                       | `isCurrentUserAdmin`                         | query    |  357 |                      | TBD      |       |
| `users.ts`                       | `getGithubConnectionStatus`                  | query    |  374 |                      | TBD      |       |
| `users.ts`                       | `disconnectGithub`                           | mutation |  399 |                      | TBD      |       |
| `users.ts`                       | `getConvexConnectionStatus`                  | query    |  416 |                      | TBD      |       |
| `users.ts`                       | `disconnectConvex`                           | mutation |  443 |                      | TBD      |       |
| `users.ts`                       | `getCloudflareConnectionStatus`              | query    |  459 |                      | TBD      |       |
| `users.ts`                       | `refreshCloudflareMcpTokenIfNeeded`          | action   |  651 |                      | TBD      |       |
| `users.ts`                       | `checkCloudflareMcpTokenHealth`              | action   |  666 |                      | TBD      |       |
| `users.ts`                       | `disconnectCloudflare`                       | mutation |  678 |                      | TBD      |       |
| `users.ts`                       | `connectGithubWithApiKey`                    | action   |  704 |                      | TBD      |       |
| `users.ts`                       | `connectConvexWithApiKey`                    | action   |  731 |                      | TBD      |       |
| `vault/actions.ts`               | `listRepositoryOwners`                       | action   |  633 |                      | TBD      |       |
| `vault/actions.ts`               | `connectRepository`                          | action   |  657 |                      | TBD      |       |
| `vault/actions.ts`               | `createRepository`                           | action   |  702 |                      | TBD      |       |
| `vault/actions.ts`               | `checkCreateRepositoryResourceNames`         | action   |  804 |                      | TBD      |       |
| `vault/actions.ts`               | `retryInfrastructureProvisioning`            | action   |  828 |                      | TBD      |       |
| `vault/actions.ts`               | `deleteVault`                                | action   |  859 |                      | TBD      |       |
| `vault/actions.ts`               | `retryDeleteVault`                           | action   |  896 |                      | TBD      |       |
| `vault/branches.ts`              | `getVaultRemoteBranches`                     | query    |  280 |                      | TBD      |       |
| `vault/branches.ts`              | `startTreeRefreshOptimistic`                 | mutation |  810 |                      | TBD      |       |
| `vault/cloudflare.ts`            | `listAccounts`                               | action   |  184 |                      | TBD      |       |
| `vault/cloudflare.ts`            | `selectDefaultAccount`                       | action   |  194 |                      | TBD      |       |
| `vault/cloudflare.ts`            | `listWorkers`                                | action   |  217 |                      | TBD      |       |
| `vault/cloudflare.ts`            | `connectExistingWorker`                      | action   |  237 |                      | TBD      |       |
| `vault/cloudflare.ts`            | `createWorker`                               | action   |  280 |                      | TBD      |       |
| `vault/convex.ts`                | `listProjects`                               | action   |  391 |                      | TBD      |       |
| `vault/convex.ts`                | `connectExistingProject`                     | action   |  401 |                      | TBD      |       |
| `vault/convex.ts`                | `createProject`                              | action   |  440 |                      | TBD      |       |
| `vault/dashboard.ts`             | `getUserVaultBranchFilters`                  | query    |  614 |                      | TBD      |       |
| `vault/dashboard.ts`             | `getUserVaultResourceLinksState`             | query    |  634 |                      | TBD      |       |
| `vault/dashboard.ts`             | `setVaultResourceLinksOpen`                  | mutation |  653 |                      | TBD      |       |
| `vault/dashboard.ts`             | `setVaultBranchFilters`                      | mutation |  689 |                      | TBD      |       |
| `vault/dashboard.ts`             | `createVaultAppRoot`                         | mutation |  741 |                      | TBD      |       |
| `vault/dashboard.ts`             | `getUserVaults`                              | query    |  881 |                      | TBD      |       |
| `vault/dashboard.ts`             | `getVaultInfrastructure`                     | query    | 1124 |                      | TBD      |       |
| `vault/deletion/events.ts`       | `listForVault`                               | query    |   66 |                      | TBD      |       |
| `vault/records.ts`               | `getVaultByRepository`                       | query    |   33 |                      | TBD      |       |
| `waitlist.ts`                    | `joinWaitlist`                               | mutation |   18 |                      | TBD      |       |
| `workspaceSidebarState.ts`       | `getWorkspaceSidebarState`                   | query    |   39 |                      | TBD      |       |
| `workspaceSidebarState.ts`       | `setWorkspaceSidebarState`                   | mutation |   66 |                      | TBD      |       |
