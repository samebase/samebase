#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

import { ACCESS_KEYS, type AccessKey } from "../apps/noter/shared/accessModel.ts";
import { isMainModule, resolveRepoRoot, runMain } from "./lib/scriptRuntime.ts";

export const convexPublicFunctionAccessInventoryOutputPath =
  "research/2026-06-17-convex-public-function-access-inventory.generated.ts";

type PublicConvexFunctionKind = "query" | "mutation" | "action";
type PublicConvexFunctionRoute = string;

type PublicConvexFunction = {
  route: PublicConvexFunctionRoute;
  kind: PublicConvexFunctionKind;
};

const MIGRATION_ACCESS_ASSIGNMENTS = {
  access_public: [
    "auth:isAuthenticated",
    "auth:signIn",
    "auth:signOut",
    "deploymentProfile:getPublicDeploymentAuthPolicy",
    "users:getViewerAuthProviders",
    "users:isCurrentUserAdmin",
    "users:isCurrentUserApproved",
    "users:viewer",
    "waitlist:joinWaitlist",
    "workspaceSidebarState:getWorkspaceSidebarState",
  ],
  access_dashboard: [
    "appProvisioningEvents:listForVault",
    "dashboardSettings:getDashboardSettings",
    "dashboardSettings:setAccountPanelOpen",
    "dashboardSettings:setEditorChatOpen",
    "dashboardSettings:setPricingBillingCycle",
    "dashboardSettings:setProvidersPanelOpen",
    "vault/dashboard:getUserVaultBranchFilters",
    "vault/dashboard:getUserVaultResourceLinksState",
    "vault/dashboard:getUserVaults",
    "vault/dashboard:getVaultInfrastructure",
    "vault/dashboard:setVaultBranchFilters",
    "vault/dashboard:setVaultResourceLinksOpen",
    "vault/deletion/events:listForVault",
    "workspaceSidebarState:setWorkspaceSidebarState",
  ],
  access_provider_connections: [
    "cloudflareMcpOAuth:getCloudflareMcpOAuthUrl",
    "convexOAuth:getConvexOAuthUrl",
    "githubOAuth:getGithubOAuthUrl",
    "users:checkCloudflareMcpTokenHealth",
    "users:connectConvexWithApiKey",
    "users:connectGithubWithApiKey",
    "users:disconnectCloudflare",
    "users:disconnectConvex",
    "users:disconnectGithub",
    "users:getCloudflareConnectionStatus",
    "users:getConvexConnectionStatus",
    "users:getGithubConnectionStatus",
    "users:refreshCloudflareMcpTokenIfNeeded",
  ],
  access_repo_connect: [
    "github:listRepositories",
    "github:listRepositoriesPreview",
    "vault/actions:connectRepository",
    "vault/actions:listRepositoryOwners",
    "vault/dashboard:createVaultAppRoot",
  ],
  access_app_create: [
    "vault/actions:checkCreateRepositoryResourceNames",
    "vault/actions:createRepository",
    "vault/actions:retryInfrastructureProvisioning",
    "vault/cloudflare:connectExistingWorker",
    "vault/cloudflare:createWorker",
    "vault/cloudflare:listAccounts",
    "vault/cloudflare:listWorkers",
    "vault/cloudflare:selectDefaultAccount",
    "vault/convex:connectExistingProject",
    "vault/convex:createProject",
    "vault/convex:listProjects",
  ],
  access_app_refresh: [
    "github:refreshRepositoryTree",
    "repositoryRefresh:enqueueDashboardRepositoryRefresh",
    "repositoryRefresh:enqueueManualRepositoryRefresh",
    "vault/branches:startTreeRefreshOptimistic",
  ],
  access_files_read: [
    "agentGraphLayout:getNodeLayouts",
    "agentGraphLayout:setNodeLayout",
    "chat/index:getThreadContext",
    "chat/index:getThreadForVault",
    "chat/index:listThreadMessages",
    "collaborative:getActiveEditors",
    "collaborative:getDocument",
    "collaborative:pullUpdates",
    "fileStaging:getByNewPath",
    "fileStaging:listStagedFiles",
    "fileStaging:listStagedFilesBranchSummaries",
    "fileStagingActions:batchReadFiles",
    "fileStagingActions:getBranchComparePreview",
    "fileStagingActions:getCommitPreview",
    "fileStagingActions:getFileForEditing",
    "fileStagingActions:getRebaseConflictBundle",
    "fileStagingActions:getRebaseConflictPreview",
    "folderExpansion:clearFolderExpansionStates",
    "folderExpansion:getFolderExpansionStates",
    "folderExpansion:setFolderExpansionState",
    "github:getRepositoryFileContent",
    "github:getRepositoryMediaAsset",
    "githubChecks:getCommitStatus",
    "vault/branches:getVaultRemoteBranches",
    "vault/records:getVaultByRepository",
  ],
  access_files_write: [
    "chat/index:confirmCommit",
    "chat/index:createThread",
    "chat/index:deleteThread",
    "chat/index:sendMessage",
    "chat/index:updateThreadDraft",
    "collaborative:pushUpdates",
    "fileStaging:clearAllStaging",
    "fileStaging:createFileInStaging",
    "fileStaging:deletePendingUploadBlob",
    "fileStaging:generateUploadUrl",
    "fileStaging:markFileForDeletion",
    "fileStaging:revertDeletedFileInStaging",
    "fileStaging:updateStagedFileContent",
    "fileStagingActions:commitStaging",
    "fileStagingActions:createDraftPullRequest",
    "fileStagingActions:createDraftPullRequestFromDefaultBranch",
    "fileStagingActions:pullFromGitHub",
    "fileStagingActions:renameFileInStaging",
    "fileStagingActions:restoreComparedDeletedFileToStaging",
    "fileStagingActions:stageUploadedMedia",
  ],
  access_machines: [
    "codespaces/executor:checkAgentHealth",
    "codespaces/executor:deleteFile",
    "codespaces/executor:ensureCodexRuntime",
    "codespaces/executor:executeCommand",
    "codespaces/executor:getCodexEvents",
    "codespaces/executor:getCodexStatus",
    "codespaces/executor:getFileStat",
    "codespaces/executor:listFiles",
    "codespaces/executor:readFileFromCodespace",
    "codespaces/executor:startCodexThread",
    "codespaces/executor:startCodexTurn",
    "codespaces/executor:writeFileToCodespace",
    "codespaces/index:createCodespace",
    "codespaces/index:deleteCodespace",
    "codespaces/index:getCodespaceConnection",
    "codespaces/index:startCodespace",
    "codespaces/index:stopCodespace",
    "codespaces/mutations:getActiveCodespace",
    "codespaces/mutations:getConnectedCodespacesCount",
    "codespaces/ports:ensureCodespacePortsVisibility",
    "codespaces/vaultIntegration:createVaultWithCodespace",
    "codespaces/vaultIntegration:ensureCodespaceReady",
    "codespaces/vaultIntegration:rebuildCodespaceIfStale",
    "connectedMachineControl:issueMachineControlToken",
    "connectedMachines:approveMachineRegistrationRequest",
    "connectedMachines:getMachineRegistrationRequestForBrowser",
    "connectedMachines:listConnectedMachines",
  ],
  access_mcp: [
    "mcp/oauth:completeAuthorizationRequestForCurrentUser",
    "mcp/oauth:denyAuthorizationRequestForCurrentUser",
    "mcp/oauth:getAuthorizationRequestForCurrentUser",
  ],
  access_admin: [
    "agentGraphActions:sendAgentMessage",
    "billing:createPolarCheckoutSession",
    "billing:createPolarCustomerPortalSession",
    "billing:getViewerBillingStatus",
    "billing:syncViewerBillingFromPolar",
    "chat/index:confirmProdRead",
    "chat/index:proposeProdRead",
    "chat/index:rejectProdRead",
    "vault/actions:deleteVault",
    "vault/actions:retryDeleteVault",
  ],
} as const satisfies Record<AccessKey, readonly PublicConvexFunctionRoute[]>;

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function readAppTsConfig(repoRoot: string): ts.ParsedCommandLine {
  const tsConfigPath = path.join(repoRoot, "apps/noter/tsconfig.json");
  const configFile = ts.readConfigFile(tsConfigPath, (filePath) => ts.sys.readFile(filePath));
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  }

  return ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(tsConfigPath));
}

function readStringLiteralProperty(
  checker: ts.TypeChecker,
  source: ts.SourceFile,
  type: ts.Type,
  propertyName: string,
): string | null {
  const property = type.getProperty(propertyName);
  if (!property) {
    return null;
  }

  const propertyType = checker.getTypeOfSymbolAtLocation(property, source);
  if (propertyType.isStringLiteral()) {
    return propertyType.value;
  }

  return null;
}

function formatConvexRoute(parts: readonly string[]): PublicConvexFunctionRoute {
  const exportName = parts.at(-1);
  if (!exportName) {
    throw new Error("Cannot format a Convex route without an export name.");
  }

  const modulePath = parts.slice(0, -1).join("/");
  if (!modulePath) {
    throw new Error(`Cannot format a Convex route without a module path: ${exportName}`);
  }

  if (exportName === "default") {
    return modulePath;
  }

  return `${modulePath}:${exportName}`;
}

function readPublicConvexFunctionsFromType(
  checker: ts.TypeChecker,
  source: ts.SourceFile,
  type: ts.Type,
  parts: readonly string[],
): PublicConvexFunction[] {
  const kind = readStringLiteralProperty(checker, source, type, "_type");
  const visibility = readStringLiteralProperty(checker, source, type, "_visibility");
  if (kind !== null || visibility !== null) {
    if (visibility === "public" && (kind === "query" || kind === "mutation" || kind === "action")) {
      return [{ route: formatConvexRoute(parts), kind }];
    }

    return [];
  }

  return checker
    .getPropertiesOfType(type)
    .filter((property) => !property.getName().startsWith("_"))
    .flatMap((property) =>
      readPublicConvexFunctionsFromType(
        checker,
        source,
        checker.getTypeOfSymbolAtLocation(property, source),
        [...parts, property.getName()],
      ),
    );
}

export function readConvexGeneratedPublicFunctions(repoRoot: string): PublicConvexFunction[] {
  const apiDtsPath = path.join(repoRoot, "apps/noter/convex/_generated/api.d.ts");
  const appTsConfig = readAppTsConfig(repoRoot);
  const rootNames = appTsConfig.fileNames.includes(apiDtsPath)
    ? appTsConfig.fileNames
    : [apiDtsPath, ...appTsConfig.fileNames];
  const program = ts.createProgram({
    rootNames,
    options: appTsConfig.options,
  });
  const checker = program.getTypeChecker();
  const apiSource = program.getSourceFile(apiDtsPath);
  if (!apiSource) {
    throw new Error(`Could not load Convex generated API types: ${apiDtsPath}`);
  }

  const moduleSymbol = checker.getSymbolAtLocation(apiSource);
  if (!moduleSymbol) {
    throw new Error(`Could not read Convex generated API module: ${apiDtsPath}`);
  }

  const apiSymbol = checker
    .getExportsOfModule(moduleSymbol)
    .find((symbol) => symbol.getName() === "api");
  if (!apiSymbol) {
    throw new Error(`Could not find exported api symbol in ${apiDtsPath}`);
  }

  return readPublicConvexFunctionsFromType(
    checker,
    apiSource,
    checker.getTypeOfSymbolAtLocation(apiSymbol, apiSource),
    [],
  ).sort((left, right) => compareUtf8(left.route, right.route));
}

function validateMigrationAssignments(publicFunctions: readonly PublicConvexFunction[]): void {
  const publicRoutes = new Set(publicFunctions.map((publicFunction) => publicFunction.route));
  const assignedRoutes = new Map<PublicConvexFunctionRoute, AccessKey>();

  for (const access of ACCESS_KEYS) {
    for (const route of MIGRATION_ACCESS_ASSIGNMENTS[access]) {
      const previousAccess = assignedRoutes.get(route);
      if (previousAccess) {
        throw new Error(
          `Public Convex function route ${route} is assigned to both ${previousAccess} and ${access}.`,
        );
      }
      assignedRoutes.set(route, access);

      if (!publicRoutes.has(route)) {
        throw new Error(
          `Public Convex function route ${route} is assigned to ${access} but is not in the generated Convex public API.`,
        );
      }
    }
  }

  const missingRoutes = publicFunctions
    .map((publicFunction) => publicFunction.route)
    .filter((route) => !assignedRoutes.has(route));
  if (missingRoutes.length > 0) {
    throw new Error(
      [
        "Public Convex function access inventory is missing assignments:",
        ...missingRoutes.map((route) => `- ${route}`),
      ].join("\n"),
    );
  }
}

function formatConstRouteArray(name: string, routes: readonly PublicConvexFunctionRoute[]): string {
  const routeLines = routes.map((route) => `  ${JSON.stringify(route)},`).join("\n");

  return `export const ${name} = [
${routeLines}
] as const satisfies readonly PublicConvexFunctionRoute[];
`;
}

function formatAccessRouteObjectEntry(access: AccessKey): string {
  const routeLines = [...MIGRATION_ACCESS_ASSIGNMENTS[access]]
    .sort(compareUtf8)
    .map((route) => `    ${JSON.stringify(route)},`)
    .join("\n");

  return `  ${access}: [
${routeLines}
  ],`;
}

export function formatConvexPublicFunctionAccessInventorySource(
  publicFunctions: readonly PublicConvexFunction[],
): string {
  validateMigrationAssignments(publicFunctions);

  const allRoutes = publicFunctions.map((publicFunction) => publicFunction.route);
  const allRoutesSource = formatConstRouteArray("publicConvexFunctionRoutes", allRoutes);
  const byAccessLines = ACCESS_KEYS.map((access) => formatAccessRouteObjectEntry(access)).join(
    "\n",
  );
  const kindLines = publicFunctions
    .map((publicFunction) => `  ${JSON.stringify(publicFunction.route)}: "${publicFunction.kind}",`)
    .join("\n");

  return `// @generated by scripts/generate-convex-public-function-access-inventory.ts
// Do not edit by hand. Run \`pnpm run generate:convex-public-function-access-inventory\`.
// Public route discovery comes from apps/noter/convex/_generated/api.d.ts.
// Access assignments are a migration aid until each route moves onto the access wrapper.

import type { AccessKey } from "../apps/noter/shared/accessModel.ts";

${allRoutesSource}
export type PublicConvexFunctionRoute = (typeof publicConvexFunctionRoutes)[number];

export type PublicConvexFunctionKind = "query" | "mutation" | "action";

export const publicConvexFunctionKindsByRoute = {
${kindLines}
} as const satisfies Record<PublicConvexFunctionRoute, PublicConvexFunctionKind>;

export const publicConvexFunctionRoutesByAccess = {
${byAccessLines}
} as const satisfies Record<AccessKey, readonly PublicConvexFunctionRoute[]>;
`;
}

export function writeConvexPublicFunctionAccessInventoryGeneratedFile(repoRoot: string): void {
  const outputFilePath = path.join(repoRoot, convexPublicFunctionAccessInventoryOutputPath);
  mkdirSync(path.dirname(outputFilePath), { recursive: true });
  writeFileSync(
    outputFilePath,
    formatConvexPublicFunctionAccessInventorySource(readConvexGeneratedPublicFunctions(repoRoot)),
    "utf8",
  );
}

export function readConvexPublicFunctionAccessInventoryGeneratedFile(repoRoot: string): string {
  return readFileSync(path.join(repoRoot, convexPublicFunctionAccessInventoryOutputPath), "utf8");
}

if (isMainModule(import.meta.url)) {
  await runMain(() => writeConvexPublicFunctionAccessInventoryGeneratedFile(resolveRepoRoot()));
}
