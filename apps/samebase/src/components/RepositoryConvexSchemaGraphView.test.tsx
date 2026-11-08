// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { observedSamebaseRepositoryReply } from "../../convex/repository/fixtures/observedSamebaseAlchemyState";
import { readDeployedStacks } from "../../shared/alchemyState";
import type { RepositoryAlchemyState } from "@/repository/dashboard/useRepositoryAlchemyState";
import { RepositoryConvexSchemaGraphView } from "./RepositoryConvexSchemaGraphView";

const mocks = vi.hoisted(() => ({
  repositories: undefined as
    | { githubRepositoryFullName: string; repositoryId: string }[]
    | undefined,
  alchemy: { state: "loading" } as RepositoryAlchemyState,
}));

vi.mock("@/components/AppWorkspaceShell", () => ({
  AppWorkspaceRouteChrome: ({
    children,
    left,
  }: {
    children: ReactNode;
    left: { content: ReactNode };
  }) => (
    <div>
      {left.content}
      {children}
    </div>
  ),
}));
vi.mock("@/components/repository-dashboard/RepositoryConvexSchemaGraph", () => ({
  RepositoryConvexSchemaGraphRouteWorkspace: ({ convexProjectId }: { convexProjectId: string }) => (
    <div data-testid="workspace">workspace of {convexProjectId}</div>
  ),
}));
vi.mock("@/lib/convexQueryCache", () => ({
  useCacheQuery: () => mocks.repositories,
}));
vi.mock("@/repository/dashboard/useRepositoryProviderObservations", () => ({
  useRepositoryProviderObservations: () => mocks.alchemy,
}));

/**
The captured stacks of samebase/samebase as Samebase reads them, with the `rootDir` on the `prod`
Site row that 0.8.0 writes, so `prod` deploys the Convex project 839311.
*/
const stacks = readDeployedStacks(
  observedSamebaseRepositoryReply.stacks.map((stack) => ({
    ...stack,
    stages: stack.stages.map((stage) =>
      stage.name === "prod"
        ? {
            ...stage,
            resources: stage.resources.map((row) =>
              row.fqn === "Site"
                ? {
                    ...row,
                    value: row.value.replace('"type":"prod"', '"type":"prod","rootDir":"."'),
                  }
                : row,
            ),
          }
        : stage,
    ),
  })),
  "samebase/samebase",
);
const foundStacks: RepositoryAlchemyState = {
  state: "loaded",
  observation: { store: "found", stacks, liveDeployments: [] },
  refreshFailed: false,
  reload: () => {},
};

function render(convexProjectId: string) {
  return renderToStaticMarkup(
    <RepositoryConvexSchemaGraphView
      branch="main"
      convexProjectId={convexProjectId}
      owner="samebase"
      repoName="samebase"
    />,
  );
}

describe("RepositoryConvexSchemaGraphView", () => {
  beforeEach(() => {
    mocks.repositories = [
      { githubRepositoryFullName: "samebase/samebase", repositoryId: "repository-a" },
    ];
    mocks.alchemy = foundStacks;
  });

  it("opens the schema of a Convex project that the stack deploys", () => {
    expect(render("839311")).toContain("workspace of 839311");
  });

  it("shows no snapshot of a project that no stack of the repository deploys", () => {
    const markup = render("123456");

    expect(markup).toContain("Convex project not found.");
    expect(markup).not.toContain("workspace of");
  });

  it("waits for the stacks before it decides", () => {
    mocks.alchemy = { state: "loading" };

    const markup = render("839311");

    expect(markup).toContain("Loading schema");
    expect(markup).not.toContain("workspace of");
  });

  it("shows the store error instead of an old snapshot", () => {
    mocks.alchemy = { state: "failed", error: new Error("Store unavailable."), reload: () => {} };

    const markup = render("839311");

    expect(markup).toContain("Store unavailable.");
    expect(markup).not.toContain("workspace of");
  });

  it("says when the repository is unknown", () => {
    mocks.repositories = [];

    expect(render("839311")).toContain("Repository not found.");
  });
});
