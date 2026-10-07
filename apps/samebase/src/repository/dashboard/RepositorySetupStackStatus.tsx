import { Button } from "@/components/ui/button";
import { repositoryExternalDataQueryKey } from "@/repository/dashboard/repositoryExternalDataQueryKey";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import { isSamebaseManagedProviderPlan } from "../../../convex/repository/provisioningPlan";
import type {
  SetupOutputApplyResult,
  SetupStatus,
} from "../../../convex/repository/setupOutputModel";

/** GitHub's run status or conclusion, such as in_progress or timed_out, as words. */
function describeLatestRun(run: NonNullable<SetupStatus["latestRun"]>): string {
  const state = run.status === "completed" ? (run.conclusion ?? "completed") : run.status;
  return (state ?? "not started").replace(/_/g, " ");
}

/**
What the newest setup output says that Samebase did not apply, or null when nothing waits.
`applyArtifactId` is the artifact that the member sees and applies; null when it has nothing to apply.
*/
function describePending(
  status: SetupStatus,
): { text: string; applyArtifactId: number | null } | null {
  const { applied, pending } = status;
  switch (pending.state) {
    case "none":
      return applied?.state === "destroy_reported"
        ? {
            text: `Destroy app run ${applied.runId} reported that it destroyed the setup stack. Samebase did not check this report. The Workers and Convex projects stay attached until you remove them.`,
            applyArtifactId: null,
          }
        : null;
    case "no_output":
      return {
        text: "The alchemy workflow succeeded without a setup output, so Samebase attached nothing. Run the alchemy workflow on the default branch to publish one.",
        applyArtifactId: null,
      };
    case "invalid_output":
      return {
        text: `Samebase cannot read the setup output of run ${pending.source.runId}: ${pending.reason}`,
        applyArtifactId: null,
      };
    case "refused":
      return {
        text: `Samebase cannot apply the setup output of run ${pending.source.runId}${pending.claim === null ? "" : ` (${pending.claim})`}: ${pending.reason}`,
        applyArtifactId: null,
      };
    case "deployed": {
      const workers = pending.workers.map(
        (worker) => `${worker.workerName} at ${worker.rootDirectory}`,
      );
      const projects = pending.projects.map(
        (project) => `${project.projectSlug} at ${project.codeLocationPath}`,
      );
      const waitsForMember =
        !applied && !pending.firstApply.automatic ? ` ${pending.firstApply.reason}` : "";
      return {
        text: `The setup output of run ${pending.source.runId} is not applied yet. Workers: ${workers.join(", ") || "none"}. Convex projects: ${projects.join(", ") || "none"}.${waitsForMember}`,
        applyArtifactId: pending.source.artifactId,
      };
    }
    case "destroyed":
      return {
        text: `Destroy app run ${pending.source.runId} reports that it destroyed the setup stack. Applying records this report only: the Workers and Convex projects stay attached until you remove them.`,
        applyArtifactId: pending.source.artifactId,
      };
    default:
      pending satisfies never;
      return null;
  }
}

/**
What the last apply adds to the status. The status read repeats a refused claim, so only the apply
transaction's refusal (such as a newer output than the reviewed one) and a failed read are new.
*/
function describeApplyProblem(result: SetupOutputApplyResult | undefined): string | null {
  return result?.state === "failed" || (result?.state === "refused" && result.step === "apply")
    ? result.reason
    : null;
}

/** Whether the setup status can change only by a new push, a member's apply, or a new attachment. */
function isSetupStatusSettled({ latestRun, applied, pending }: SetupStatus): boolean {
  // Without a setup run, only a new app that waits for its first run changes by itself; a destroy
  // receipt can outlive every setup run.
  if (
    latestRun === null
      ? applied === null && pending.state === "none"
      : latestRun.status !== "completed"
  ) {
    return false;
  }
  return !(applied === null && pending.state === "deployed" && pending.firstApply.automatic);
}

/**
The setup status of a repository that its GitHub Actions set up, once Samebase's own setup finished:
the newest alchemy run on the default branch, and the setup output that waits for a member's apply.
The status is a live GitHub, Cloudflare, and Convex read, so it renders nothing until it loads.
*/
export function RepositorySetupStackStatus({ repository }: { repository: UserRepositoryResult }) {
  const { repositoryId, providerPlan } = repository;
  const enabled =
    repository.providerSetup.status === "ready" &&
    repository.deletion.state === "not_deleting" &&
    providerPlan !== null &&
    !isSamebaseManagedProviderPlan(providerPlan);
  // The attachments are a live Convex subscription. An apply by observeFirstSetupOutput or by
  // another member changes them, which changes this key and reads the status again.
  const attachments = [
    ...repository.cloudflareWorkers.map((worker) => worker.workerTag),
    ...repository.convexProjects.map((project) => project.projectId),
  ].sort((left, right) => left.localeCompare(right));
  const readStatus = useAction(api.repository.setupOutput.readStatus);
  const applySetupOutput = useAction(api.repository.setupOutput.apply);
  const statusQuery = useQuery({
    queryKey: [...repositoryExternalDataQueryKey(repositoryId), "setup-stack", attachments],
    queryFn: () => readStatus({ repositoryId }),
    enabled,
    // Keep the last status on screen while a new attachment reads it again.
    placeholderData: (previous) => previous,
    // The read lists workflow runs and checks every claim with Cloudflare and Convex.
    staleTime: 60 * 1000,
    // GitHub does not push run changes, so the open overview reads again while the newest run has
    // not finished or observeFirstSetupOutput may still apply the first output.
    refetchInterval: (query) =>
      query.state.data && isSetupStatusSettled(query.state.data) ? false : 30 * 1000,
    retry: false,
  });
  const applyMutation = useMutation({
    mutationFn: (artifactId: number) => applySetupOutput({ repositoryId, artifactId }),
    onSettled: () => statusQuery.refetch(),
  });

  if (!enabled) {
    return null;
  }
  if (statusQuery.isError) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>Could not read the setup status.</span>
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => void statusQuery.refetch()}
        >
          Retry
        </Button>
      </section>
    );
  }
  const status = statusQuery.data;
  if (!status) {
    return null;
  }
  const pending = describePending(status);
  const applyArtifactId = pending?.applyArtifactId ?? null;
  const applyProblem = applyMutation.isError
    ? "Could not apply the setup output."
    : describeApplyProblem(applyMutation.data);

  return (
    <section aria-label="Setup stack" className="grid gap-2 text-sm">
      <p className="text-muted-foreground">
        {status.latestRun ? (
          <>
            Setup stack:{" "}
            <a
              className="font-medium text-foreground underline underline-offset-4"
              href={status.latestRun.url}
              rel="noreferrer noopener"
              target="_blank"
            >
              alchemy run {status.latestRun.runId}
            </a>{" "}
            {describeLatestRun(status.latestRun)}.
          </>
        ) : (
          "Setup stack: the alchemy workflow has not run on the default branch yet."
        )}
      </p>
      {pending ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="min-w-0 text-xs leading-5 text-muted-foreground">{pending.text}</p>
          {applyArtifactId === null ? null : (
            <Button
              disabled={applyMutation.isPending}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => applyMutation.mutate(applyArtifactId)}
            >
              {applyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {applyMutation.isPending ? "Applying..." : "Apply setup output"}
            </Button>
          )}
        </div>
      ) : null}
      {applyProblem ? (
        <p className="text-xs leading-5 text-red-700" role="alert">
          {applyProblem}
        </p>
      ) : null}
    </section>
  );
}
