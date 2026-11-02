import { useCallback, useState } from "react";
import { useAction } from "convex/react";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  ActionConfirmation,
  ActionConfirmationRequest,
} from "../../../convex/repository/contracts/actionConfirmation";
import { toast } from "@/components/ui/use-toast";
import {
  clearRepositoryDashboardQueryDialogSearch,
  useRootRouteSearch,
  type RepositoryDashboardQueryDialog,
  type RootRouteSearch,
} from "@/routeSearch/root";
import { applySearchPatch } from "@/routing/searchFlags";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { RepositoryDeleteDialog } from "./RepositoryDeleteDialog";
import { RepositoryOverviewPage, type RepositoryOverviewPageKind } from "./RepositoryOverviewPage";
import type { RepositoryWorkspaceSelected as RepositoryWorkspace } from "./repositoryWorkspaceModel";
import { RepositoryActionConfirmationDialog } from "./RepositoryActionConfirmationDialog";

type PendingConfirmation = {
  title: string;
  confirmLabel: string;
  request: ActionConfirmationRequest;
  /** The gated call. Without a confirmation it returns the request; with one it performs it. */
  run: (confirmation: ActionConfirmation | undefined) => Promise<ActionConfirmationRequest | null>;
};

function readRepositoryProviderActionBlockReason(
  repository: RepositoryWorkspace["repository"],
): string | null {
  switch (repository.providerWrite.status) {
    case "active":
      return "A provider operation is in progress.";
    case "idle":
      break;
  }

  if (repository.deletion.state === "deleting") {
    return "Removal from Samebase is in progress.";
  }
  if (repository.deletion.state === "delete_failed") {
    return "Retry removal from Samebase before you change providers.";
  }
  return repository.hasConnectedGitHubRepository ? null : "Finish GitHub repository setup first.";
}

export function RepositorySelectedWorkspace({
  developerToolsVisible,
  page,
  workspace,
}: {
  developerToolsVisible: boolean;
  page: RepositoryOverviewPageKind;
  workspace: RepositoryWorkspace;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const repositoryDashboardDialogHistoryEntry = useLocation({
    select: (location) => location.state.repositoryDashboardDialog,
  });
  const rootRouteSearch = useRootRouteSearch();
  const retryDeleteRepository = useAction(api.repository.actions.retryDeleteRepository);
  const retryProviderSetup = useAction(api.repository.retryProviderSetup);
  const [isRetryingRepositoryAction, setIsRetryingRepositoryAction] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const repository = workspace.repository;
  const deleteModeActive = rootRouteSearch.delete === true;
  const providerActionBlockReason = readRepositoryProviderActionBlockReason(repository);

  const replaceRepositoryDashboardDialogRoute = useCallback(
    (dialog: RepositoryDashboardQueryDialog) => {
      void navigate({
        replace: true,
        resetScroll: false,
        search: (currentSearch: RootRouteSearch) =>
          clearRepositoryDashboardQueryDialogSearch(currentSearch, dialog),
        state: (currentState) => ({
          ...currentState,
          repositoryDashboardDialog: undefined,
        }),
        to: ".",
      });
    },
    [navigate],
  );

  const closeRepositoryDashboardDialog = (dialog: RepositoryDashboardQueryDialog) => {
    if (repositoryDashboardDialogHistoryEntry?.dialog === dialog && router.history.canGoBack()) {
      router.history.back();
      return;
    }
    replaceRepositoryDashboardDialogRoute(dialog);
  };

  const handleRetryRepositoryDeletion = async (runId: Id<"workflow_repositoryDeletion_runs">) => {
    if (isRetryingRepositoryAction) {
      return;
    }
    setIsRetryingRepositoryAction(true);
    try {
      await retryDeleteRepository({ runId });
    } catch (error) {
      toast({
        title: "Could not retry removal from Samebase",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRetryingRepositoryAction(false);
    }
  };

  const handleRetryInfrastructureProvisioning = async () => {
    if (providerActionBlockReason || isRetryingRepositoryAction) {
      return;
    }
    setIsRetryingRepositoryAction(true);
    try {
      const run = (confirmation: ActionConfirmation | undefined) =>
        retryProviderSetup({ repositoryId: repository.repositoryId, confirmation });
      const request = await run(undefined);
      if (request) {
        setPendingConfirmation({
          title: "Retry provider setup?",
          confirmLabel: "Retry setup",
          request,
          run,
        });
      }
    } catch (error) {
      toast({
        title: "Could not retry infrastructure setup",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRetryingRepositoryAction(false);
    }
  };

  return (
    <>
      <RepositoryOverviewPage
        developerToolsVisible={developerToolsVisible}
        isRetryingRepositoryAction={isRetryingRepositoryAction}
        page={page}
        workspace={workspace}
        onOpenDeleteDialog={() => {
          void navigate({
            resetScroll: false,
            to: ".",
            search: (currentSearch: RootRouteSearch) =>
              applySearchPatch(currentSearch, { delete: true }),
            state: (currentState) => ({
              ...currentState,
              repositoryDashboardDialog: { dialog: "delete" },
            }),
          });
        }}
        onRetryInfrastructureProvisioning={() => {
          void handleRetryInfrastructureProvisioning();
        }}
        onRetryRepositoryDeletion={() => {
          if (repository.deletion.state === "delete_failed") {
            void handleRetryRepositoryDeletion(repository.deletion.runId);
          }
        }}
      />
      {deleteModeActive ? (
        <RepositoryDeleteDialog
          key={repository.repositoryId}
          repository={repository}
          onClose={() => {
            closeRepositoryDashboardDialog("delete");
          }}
          onDeleted={() => {
            void navigate({
              replace: true,
              search: (currentSearch: RootRouteSearch) =>
                applySearchPatch(currentSearch, {
                  delete: null,
                }),
              state: (currentState) => ({
                ...currentState,
                repositoryDashboardDialog: undefined,
              }),
              to: DASHBOARD_ROUTE,
            });
          }}
        />
      ) : null}
      {pendingConfirmation ? (
        <RepositoryActionConfirmationDialog
          key={pendingConfirmation.request.token}
          confirmLabel={pendingConfirmation.confirmLabel}
          onCancel={() => {
            setPendingConfirmation(null);
          }}
          onConfirm={async (confirmation) => {
            await pendingConfirmation.run(confirmation);
            setPendingConfirmation(null);
          }}
          request={pendingConfirmation.request}
          title={pendingConfirmation.title}
        />
      ) : null}
    </>
  );
}
