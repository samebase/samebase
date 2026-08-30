import type { ReactNode } from "react";

import type { Id } from "../../../convex/_generated/dataModel";
import { CloudflareBuildTokenField } from "@/components/CloudflareBuildTokenField";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { VaultCloudflareDialogContent } from "./VaultCloudflareDialog";
import { VaultConvexDialogContent } from "./VaultConvexDialog";
import { VaultDeleteDialogContent } from "./VaultDeleteDialog";

export type VaultOverviewDialogsVisualMode =
  | "vault-overview-v2-cloudflare-builds-repair"
  | "vault-overview-v2-cloudflare-dialog"
  | "vault-overview-v2-cloudflare-dialog-invalid-name"
  | "vault-overview-v2-cloudflare-dialog-loading"
  | "vault-overview-v2-convex-dialog"
  | "vault-overview-v2-convex-dialog-error"
  | "vault-overview-v2-convex-dialog-loading"
  | "vault-overview-v2-delete-dialog";

type CloudflareDialogWorker = Parameters<typeof VaultCloudflareDialogContent>[0]["workers"][number];

function fakeVaultId(): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this visual fixture
  // only needs a stable value for component props.
  return "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function cloudflareWorker(overrides: Partial<CloudflareDialogWorker>): CloudflareDialogWorker {
  return {
    workerName: "samebase",
    workerTag: "worker-tag",
    repository: { state: "not_connected" },
    convexBuildAccess: { state: "not_configured" },
    ...overrides,
  };
}

const VAULT = {
  repositoryFullName: "samebase/shared-convex-monorepo-fixture",
};

const CONVEX_CODE_LOCATIONS = [
  {
    state: "valid" as const,
    kind: "config" as const,
    convexConfigPath: "apps/portal/convex.json",
    rootDirectory: "apps/portal",
    blobSha: "blob-portal",
  },
  {
    state: "valid" as const,
    kind: "directory" as const,
    convexDirectoryPath: "packages/backend/convex",
    rootDirectory: "packages/backend",
    convexDirectoryTreeSha: "tree-backend",
    packageJsonPath: "packages/backend/package.json",
    packageJsonBlobSha: "blob-backend-package",
  },
];

const CONVEX_PROJECTS = [
  {
    teamId: "samebase-team",
    projectId: "portal-project",
    projectName: "Portal",
    projectSlug: "portal",
    productionDeployment: { state: "available" as const, region: "aws-eu-west-1" as const },
    teamSlug: "samebase",
    workerReferences: [
      {
        accountId: "samebase-account",
        workerName: "shared-convex-monorepo-fixture-portal",
        workerTag: "portal-worker-tag",
        rootDirectory: "apps/portal",
        markerTeamId: "samebase-team",
        access: "configured" as const,
      },
    ],
  },
  {
    teamId: "samebase-team",
    projectId: "backend-project",
    projectName: "Backend",
    projectSlug: "backend",
    productionDeployment: { state: "missing" as const },
    teamSlug: "samebase",
    workerReferences: [],
  },
];

const CLOUDFLARE_WORKERS = [
  cloudflareWorker({
    workerName: "shared-convex-monorepo-fixture-admin",
    workerTag: "admin-worker-tag",
    repository: {
      state: "ready",
      rootDirectory: "apps/admin",
      builds: { state: "not_available" },
    },
  }),
  cloudflareWorker({
    workerName: "shared-convex-monorepo-fixture-portal",
    workerTag: "portal-worker-tag",
    repository: {
      state: "ready",
      rootDirectory: "apps/portal",
      builds: { state: "not_available" },
    },
  }),
  cloudflareWorker({
    workerName: "shared-convex-monorepo-fixture-web",
    workerTag: "web-worker-tag",
    repository: {
      state: "ready",
      rootDirectory: "apps/web",
      builds: { state: "not_available" },
    },
  }),
  cloudflareWorker({
    workerName: "unconnected-worker",
    workerTag: "unconnected-worker-tag",
  }),
];

function DialogFixture({
  children,
  mode,
}: {
  children: ReactNode;
  mode: VaultOverviewDialogsVisualMode;
}) {
  return (
    <TestRouterProvider
      initialEntries={["/vault/samebase/shared-convex-monorepo-fixture/settings"]}
    >
      <div data-testid={mode} className="min-h-dvh bg-background text-foreground" />
      {children}
    </TestRouterProvider>
  );
}

function ConvexDialogFixture({
  error,
  isLoading,
  mode,
}: {
  error: string | null;
  isLoading: boolean;
  mode: Extract<VaultOverviewDialogsVisualMode, `vault-overview-v2-convex-dialog${string}`>;
}) {
  return (
    <DialogFixture mode={mode}>
      <VaultConvexDialogContent
        codeLocations={isLoading ? [] : CONVEX_CODE_LOCATIONS}
        createCodeLocationKey="config:apps/portal/convex.json"
        createDeploymentRegion={null}
        convexDeploymentRegionField={null}
        createProjectName=""
        projects={isLoading ? [] : CONVEX_PROJECTS}
        error={error}
        isLoading={isLoading}
        isSubmitting={false}
        mode="existing"
        onCreateCodeLocationKeyChange={() => {}}
        onCreateProjectNameChange={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onProjectCodeLocationKeyChange={() => {}}
        onProjectToggle={() => {}}
        onSubmit={() => {}}
        repairProject={null}
        selectedProjectCodeLocationKeys={
          isLoading
            ? {}
            : {
                "portal-project": "config:apps/portal/convex.json",
                "backend-project": "directory:packages/backend/convex",
              }
        }
        sourceCompleteness={isLoading ? null : "complete"}
        vault={VAULT}
      />
    </DialogFixture>
  );
}

function CloudflareDialogFixture({
  isLoading,
  mode,
  repair,
}: {
  isLoading: boolean;
  mode: Extract<VaultOverviewDialogsVisualMode, `vault-overview-v2-cloudflare-${string}`>;
  repair: boolean;
}) {
  const invalidName = mode === "vault-overview-v2-cloudflare-dialog-invalid-name";
  const showsBuildToken = repair || invalidName;
  return (
    <DialogFixture mode={mode}>
      <VaultCloudflareDialogContent
        cloudflareBuildTokenField={
          showsBuildToken ? (
            <CloudflareBuildTokenField
              disabled={false}
              emptyState="required"
              error={false}
              id="visual-cloudflare-build-token"
              isLoading={false}
              lastUsedUuid="fixture-build-token"
              onReload={() => {}}
              onValueChange={() => {}}
              selectionUnavailable={false}
              tokens={[
                {
                  name: "Workers Builds - 2026-08-14 01:54",
                  uuid: "fixture-build-token",
                },
              ]}
              value="fixture-build-token"
            />
          ) : null
        }
        hasSelectedBuildToken
        createRootDirectory={repair ? "apps/portal" : "/"}
        createWorkerName={invalidName ? "samebase app" : ""}
        didAddWorker={false}
        error={null}
        folderSuggestions={["apps", "apps/admin", "apps/portal", "apps/web", "packages/backend"]}
        isLoading={isLoading}
        isSubmitting={false}
        inventoryState={isLoading || repair ? null : "complete"}
        mode={invalidName ? "create" : "existing"}
        onCreateRootDirectoryChange={() => {}}
        onCreateWorkerNameChange={() => {}}
        onConnectWorker={() => {}}
        onConnectWorkerBack={() => {}}
        onModeChange={() => {}}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        onWorkerToggle={() => {}}
        repairWorker={
          repair
            ? {
                workerName: "shared-convex-monorepo-fixture-portal",
                rootDirectory: "apps/portal",
              }
            : null
        }
        selectedWorkerTags={
          isLoading || repair ? [] : ["admin-worker-tag", "portal-worker-tag", "web-worker-tag"]
        }
        vault={VAULT}
        workerToConnect={null}
        workers={isLoading || repair ? [] : CLOUDFLARE_WORKERS}
      />
    </DialogFixture>
  );
}

export function VaultOverviewDialogsVisualFixture({
  mode,
}: {
  mode: VaultOverviewDialogsVisualMode;
}) {
  switch (mode) {
    case "vault-overview-v2-delete-dialog":
      return (
        <DialogFixture mode={mode}>
          <VaultDeleteDialogContent
            commitError={null}
            deleteError={null}
            didAttemptCommit={false}
            onCommitBeforeRemove={() => {}}
            onDeleteOptionChange={() => {}}
            onOpenChange={() => {}}
            onRemoveVault={() => {}}
            progress="idle"
            removeConvexProvision={false}
            removeGithubRepo={false}
            removeCloudflareProvision={false}
            stagedChangesCount={3}
            target={{
              id: fakeVaultId(),
              repositoryFullName: "samebase/shared-convex-monorepo-fixture",
              isSamebaseManaged: true,
              canRemoveGithubRepo: true,
              hasConvexProvision: true,
              hasCloudflareProvision: true,
              canRemoveConvexProvision: true,
              canRemoveCloudflareProvision: true,
            }}
          />
        </DialogFixture>
      );
    case "vault-overview-v2-convex-dialog":
      return <ConvexDialogFixture error={null} isLoading={false} mode={mode} />;
    case "vault-overview-v2-convex-dialog-loading":
      return <ConvexDialogFixture error={null} isLoading mode={mode} />;
    case "vault-overview-v2-convex-dialog-error":
      return (
        <ConvexDialogFixture
          error="Could not discover Convex projects. Try again."
          isLoading={false}
          mode={mode}
        />
      );
    case "vault-overview-v2-cloudflare-dialog":
      return <CloudflareDialogFixture isLoading={false} mode={mode} repair={false} />;
    case "vault-overview-v2-cloudflare-dialog-invalid-name":
      return <CloudflareDialogFixture isLoading={false} mode={mode} repair={false} />;
    case "vault-overview-v2-cloudflare-dialog-loading":
      return <CloudflareDialogFixture isLoading mode={mode} repair={false} />;
    case "vault-overview-v2-cloudflare-builds-repair":
      return <CloudflareDialogFixture isLoading={false} mode={mode} repair />;
    default:
      mode satisfies never;
      return null;
  }
}
