import { useCallback, useState } from "react";

import type { Id } from "../../../convex/_generated/dataModel";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import {
  RepositoryConvexSchemaGraphRouteWorkspaceContent,
  type RepositoryConvexSchemaGraphRouteContext,
  type RepositoryConvexSchemaGraphState,
} from "./RepositoryConvexSchemaGraph";

export type RepositoryConvexSchemaGraphVisualMode = "repository-overview-v2-convex-schema";

function fakeConvexProjectId(): Id<"repositoryConvexProjects"> {
  // @ts-expect-error Convex ids are strings at runtime; this visual fixture
  // only needs a stable value for component props.
  return "convex-project-samebase";
}

function fakeConvexSchemaSnapshotId(): Id<"observations_repositoryConvexSchema_snapshots"> {
  // @ts-expect-error Convex ids are strings at runtime; this visual fixture
  // only needs a stable value for component props.
  return "schema-snapshot-samebase";
}

function buildSchemaGraphState(): RepositoryConvexSchemaGraphState {
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
            name: "organizations",
            source: "declared",
            documentCount: 6,
            indexes: [],
            fields: [
              {
                path: "githubOwnerLogin",
                kind: "string",
                optional: false,
                source: "declared",
              },
            ],
          },
          {
            name: "organizationProviderCredentials",
            source: "declared",
            documentCount: 6,
            indexes: [
              {
                name: "by_organization",
                fields: ["organizationId"],
              },
              {
                name: "by_convex_connected_by_user",
                fields: ["convex.connectedByUserId"],
              },
            ],
            fields: [
              {
                path: "organizationId",
                kind: "Id<organizations>",
                optional: false,
                source: "declared",
                targetTable: "organizations",
              },
              {
                path: "convex.connectedByUserId",
                kind: "Id<users>",
                optional: true,
                source: "declared",
                targetTable: "users",
              },
              {
                path: "convex.auth.method",
                kind: "union",
                optional: true,
                source: "declared",
              },
              {
                path: "cloudflare.auth.method",
                kind: "union",
                optional: true,
                source: "declared",
              },
            ],
          },
          {
            name: "repositories",
            source: "mixed",
            documentCount: 48,
            indexes: [{ name: "by_organization", fields: ["organizationId"] }],
            fields: [
              {
                path: "organizationId",
                kind: "Id<organizations>",
                optional: false,
                source: "declared",
                targetTable: "organizations",
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
            name: "repositoryStagedFiles",
            source: "mixed",
            documentCount: 318,
            indexes: [{ name: "by_repository_and_branch", fields: ["repositoryId", "branch"] }],
            fields: [
              {
                path: "repositoryId",
                kind: "Id<repositories>",
                optional: false,
                source: "declared",
                targetTable: "repositories",
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
            id: "declared:organizationProviderCredentials:organizationId:organizations",
            fromTable: "organizationProviderCredentials",
            fromField: "organizationId",
            toTable: "organizations",
            source: "declared",
          },
          {
            id: "declared:organizationProviderCredentials:convex.connectedByUserId:users",
            fromTable: "organizationProviderCredentials",
            fromField: "convex.connectedByUserId",
            toTable: "users",
            source: "declared",
          },
          {
            id: "declared:repositories:organizationId:organizations",
            fromTable: "repositories",
            fromField: "organizationId",
            toTable: "organizations",
            source: "declared",
          },
          {
            id: "declared:repositoryStagedFiles:repositoryId:repositories",
            fromTable: "repositoryStagedFiles",
            fromField: "repositoryId",
            toTable: "repositories",
            source: "declared",
          },
          {
            id: "declared:repositoryStagedFiles:lastEditUserId:users",
            fromTable: "repositoryStagedFiles",
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
  layout: RepositoryConvexSchemaGraphState["layout"],
  nodeId: string,
  x: number,
  y: number,
): RepositoryConvexSchemaGraphState["layout"] {
  return [...layout.filter((entry) => entry.nodeId !== nodeId), { nodeId, x, y }].sort(
    (left, right) => left.nodeId.localeCompare(right.nodeId),
  );
}

export function RepositoryConvexSchemaGraphVisualFixture({
  mode,
}: {
  mode: RepositoryConvexSchemaGraphVisualMode;
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
    githubRepositoryFullName: "samebase/samebase",
  } satisfies RepositoryConvexSchemaGraphRouteContext;

  return (
    <TestRouterProvider
      initialEntries={["/repo/samebase/samebase/schema/main/project/convex-project-samebase"]}
    >
      <div data-testid={mode} className="h-dvh">
        <RepositoryConvexSchemaGraphRouteWorkspaceContent
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
