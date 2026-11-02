import type { ReactNode } from "react";

import type { Id } from "../../../convex/_generated/dataModel";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { RepositoryDeleteDialogContent } from "./RepositoryDeleteDialog";

export type RepositoryOverviewDialogsVisualMode = "repository-overview-v2-delete-dialog";

function fakeRepositoryId(): Id<"repositories"> {
  // @ts-expect-error Convex ids are strings at runtime; this visual fixture
  // only needs a stable value for component props.
  return "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function DialogFixture({
  children,
  mode,
}: {
  children: ReactNode;
  mode: RepositoryOverviewDialogsVisualMode;
}) {
  return (
    <TestRouterProvider initialEntries={["/repo/samebase/shared-convex-monorepo-fixture/settings"]}>
      <div data-testid={mode} className="min-h-dvh bg-background text-foreground" />
      {children}
    </TestRouterProvider>
  );
}

export function RepositoryOverviewDialogsVisualFixture({
  mode,
}: {
  mode: RepositoryOverviewDialogsVisualMode;
}) {
  return (
    <DialogFixture mode={mode}>
      <RepositoryDeleteDialogContent
        commitError={null}
        deleteError={null}
        didAttemptCommit={false}
        onCommitBeforeRemove={() => {}}
        onOpenChange={() => {}}
        onRemoveGithubRepoChange={() => {}}
        onRemoveRepository={() => {}}
        progress="idle"
        removeGithubRepo={false}
        stagedChangesCount={3}
        target={{
          repositoryId: fakeRepositoryId(),
          githubRepositoryFullName: "samebase/shared-convex-monorepo-fixture",
          isSamebaseManaged: true,
          canRemoveGithubRepo: true,
          setupStack: null,
        }}
      />
    </DialogFixture>
  );
}
