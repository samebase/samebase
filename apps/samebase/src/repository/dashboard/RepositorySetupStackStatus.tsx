import { Button } from "@/components/ui/button";
import { repositoryExternalDataQueryKey } from "@/repository/dashboard/repositoryExternalDataQueryKey";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import { isSamebaseManagedProviderPlan } from "../../../convex/repository/provisioningPlan";
import type { SetupStatus } from "../../../convex/repository/setupOutputModel";

/** GitHub's run status or conclusion, such as in_progress or timed_out, as words. */
function describeLatestRun(run: NonNullable<SetupStatus["latestRun"]>): string {
  const state = run.status === "completed" ? (run.conclusion ?? "completed") : run.status;
  return (state ?? "not started").replace(/_/g, " ");
}

/** What the newest setup output says that Samebase did not apply, or null when nothing waits. */
function describePending(status: SetupStatus): { text: string; canApply: boolean } | null {
  const { applied, pending } = status;
  switch (pending.state) {
    case "none":
      return applied?.state === "destroy_reported"
        ? {
            text: `Run ${applied.runId} reported that it destroyed the setup stack. Samebase did not check this report. The Workers and Convex projects stay attached until you remove them.`,
            canApply: false,
          }
        : null;
    case "invalid_output":
      return {
        text: `Samebase cannot read the setup output of run ${pending.source.runId}: ${pending.reason}`,
        canApply: false,
      };
    case "refused":
      return {
        text: `Samebase cannot apply the setup output of run ${pending.source.runId}${pending.claim === null ? "" : ` (${pending.claim})`}: ${pending.reason}`,
        canApply: false,
      };
    case "deployed": {
      const workers = pending.workers.map(
        (worker) => `${worker.workerName} at ${worker.rootDirectory}`,
      );
      const projects = pending.projects.map(
        (project) => `${project.projectName} at ${project.codeLocationPath}`,
      );
      const waitsForMember =
        !applied && !pending.firstApply.automatic ? ` ${pending.firstApply.reason}` : "";
      return {
        text: `The setup output of run ${pending.source.runId} is not applied yet. Workers: ${workers.join(", ") || "none"}. Convex projects: ${projects.join(", ") || "none"}.${waitsForMember}`,
        canApply: true,
      };
    }
    case "destroyed":
      return {
        text: `Run ${pending.source.runId} reports that it destroyed the setup stack. Applying records this report only: the Workers and Convex projects stay attached until you remove them.`,
        canApply: true,
      };
    default:
      pending satisfies never;
      return null;
  }
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
  const readStatus = useAction(api.repository.setupOutput.readStatus);
  const applySetupOutput = useAction(api.repository.setupOutput.apply);
  const statusQuery = useQuery({
    queryKey: [...repositoryExternalDataQueryKey(repositoryId), "setup-stack"],
    queryFn: () => readStatus({ repositoryId }),
    enabled,
    // The read lists workflow runs and checks every claim with Cloudflare and Convex.
    staleTime: 60 * 1000,
    retry: false,
  });
  const applyMutation = useMutation({
    mutationFn: () => applySetupOutput({ repositoryId }),
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
  const applyResult = applyMutation.data;
  // The status read repeats a refused claim; only the apply transaction's refusal and a failed read
  // are new here.
  const applyProblem = applyMutation.isError
    ? "Could not apply the setup output."
    : applyResult?.state === "failed" ||
        (applyResult?.state === "refused" && applyResult.step === "apply")
      ? applyResult.reason
      : null;

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
          {pending.canApply ? (
            <Button
              disabled={applyMutation.isPending}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => applyMutation.mutate()}
            >
              {applyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {applyMutation.isPending ? "Applying..." : "Apply setup output"}
            </Button>
          ) : null}
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
