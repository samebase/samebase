import { useCallback, useState } from "react";

import type { Id } from "../../../convex/_generated/dataModel";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import {
  VaultConvexSchemaGraphRouteWorkspaceContent,
  type VaultConvexSchemaGraphRouteContext,
  type VaultConvexSchemaGraphState,
} from "./VaultConvexSchemaGraph";

export type VaultConvexSchemaGraphVisualMode = "vault-overview-v2-convex-schema";

function fakeConvexProjectId(): Id<"vaultConvexProjects"> {
  // @ts-expect-error Convex ids are strings at runtime; this visual fixture
  // only needs a stable value for component props.
  return "convex-project-samebase";
}

function fakeConvexSchemaSnapshotId(): Id<"observations_vaultConvexSchema_snapshots"> {
  // @ts-expect-error Convex ids are strings at runtime; this visual fixture
  // only needs a stable value for component props.
  return "schema-snapshot-samebase";
}

function buildSchemaGraphState(): VaultConvexSchemaGraphState {
  return {
    project: {
      convexProjectId: fakeConvexProjectId(),
      rootDirectory: "apps/samebase",
      projectId: "samebase",
    },
    snapshot: {
      _id: fakeConvexSchemaSnapshotId(),
      fetchedAt: Date.parse("2026-07-26T12:00:00Z"),
      schemaHash: "f7c9a120",
      graph: {
        tables: [
          {
            name: "users",
            source: "mixed",
            documentCount: 124,
            indexes: [{ name: "email", fields: ["email"] }],
            fields: [
              {
                path: "email",
                kind: "string",
                optional: false,
                source: "declared",
              },
              {
                path: "name",
                kind: "string",
                optional: true,
                source: "declared",
              },
              {
                path: "isApproved",
                kind: "boolean",
                optional: false,
                source: "declared",
              },
            ],
          },
          {
            name: "providerConnections",
            source: "declared",
            documentCount: 42,
            indexes: [{ name: "by_user_kind", fields: ["userId", "kind"] }],
            fields: [
              {
                path: "userId",
                kind: "Id<users>",
                optional: false,
                source: "declared",
                targetTable: "users",
              },
              {
                path: "kind",
                kind: "union",
                optional: false,
                source: "declared",
              },
              {
                path: "auth.method",
                kind: "union",
                optional: false,
                source: "declared",
              },
            ],
          },
          {
            name: "vaults",
            source: "mixed",
            documentCount: 48,
            indexes: [{ name: "by_userId", fields: ["userId"] }],
            fields: [
              {
                path: "userId",
                kind: "Id<users>",
                optional: false,
                source: "declared",
                targetTable: "users",
              },
              {
                path: "owner",
                kind: "string",
                optional: false,
                source: "declared",
              },
              {
                path: "name",
                kind: "string",
                optional: false,
                source: "declared",
              },
              {
                path: "defaultBranch",
                kind: "string",
                optional: false,
                source: "declared",
              },
            ],
          },
          {
            name: "vaultStagedFiles",
            source: "mixed",
            documentCount: 318,
            indexes: [{ name: "by_vault_and_branch", fields: ["vaultId", "branch"] }],
            fields: [
              {
                path: "vaultId",
                kind: "Id<vaults>",
                optional: false,
                source: "declared",
                targetTable: "vaults",
              },
              {
                path: "lastEditUserId",
                kind: "Id<users>",
                optional: false,
                source: "declared",
                targetTable: "users",
              },
              {
                path: "filePath",
                kind: "string",
                optional: false,
                source: "declared",
              },
              {
                path: "content.kind",
                kind: "union",
                optional: false,
                source: "declared",
              },
            ],
          },
        ],
        relationships: [
          {
            id: "declared:providerConnections:userId:users",
            fromTable: "providerConnections",
            fromField: "userId",
            toTable: "users",
            source: "declared",
          },
          {
            id: "declared:vaults:userId:users",
            fromTable: "vaults",
            fromField: "userId",
            toTable: "users",
            source: "declared",
          },
          {
            id: "declared:vaultStagedFiles:vaultId:vaults",
            fromTable: "vaultStagedFiles",
            fromField: "vaultId",
            toTable: "vaults",
            source: "declared",
          },
          {
            id: "declared:vaultStagedFiles:lastEditUserId:users",
            fromTable: "vaultStagedFiles",
            fromField: "lastEditUserId",
            toTable: "users",
            source: "declared",
          },
        ],
        warnings: [],
      },
    },
    layout: [],
  };
}

function saveLayout(
  layout: VaultConvexSchemaGraphState["layout"],
  nodeId: string,
  x: number,
  y: number,
): VaultConvexSchemaGraphState["layout"] {
  return [...layout.filter((entry) => entry.nodeId !== nodeId), { nodeId, x, y }].sort(
    (left, right) => left.nodeId.localeCompare(right.nodeId),
  );
}

export function VaultConvexSchemaGraphVisualFixture({
  mode,
}: {
  mode: VaultConvexSchemaGraphVisualMode;
}) {
  const [state, setState] = useState(buildSchemaGraphState);
  const handleSaveLayout = useCallback((nodeId: string, x: number, y: number) => {
    setState((currentState) => ({
      ...currentState,
      layout: saveLayout(currentState.layout, nodeId, x, y),
    }));
  }, []);
  const context = {
    branch: "main",
    convexCodePath: "apps/samebase/convex.json",
    projectId: "samebase",
    repositoryFullName: "samebase/samebase",
  } satisfies VaultConvexSchemaGraphRouteContext;

  return (
    <TestRouterProvider
      initialEntries={["/vault/samebase/samebase/schema/main/project/convex-project-samebase"]}
    >
      <div data-testid={mode} className="h-dvh">
        <VaultConvexSchemaGraphRouteWorkspaceContent
          context={context}
          state={state}
          refreshPending={false}
          refreshError={null}
          onRefresh={() => {}}
          onSaveLayout={handleSaveLayout}
        />
      </div>
    </TestRouterProvider>
  );
}
