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
            text: `Run ${applied.runId} reported that it destroyed the setup stack. Samebase did not check this report. The Workers and Convex projects stay attached until you remove them.`,
            applyArtifactId: null,
          }
        : null;
    case "failed":
      // The headline names the failed run.
      return null;
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
        text: `Run ${pending.source.runId} reports that it destroyed the setup stack. Applying records this report only: the Workers and Convex projects stay attached until you remove them.`,
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

/**
Whether the setup status waits for something soon: the first setup output, or the first apply that
observeFirstSetupOutput may still make.
*/
function isSetupStatusSettled({ latestRun, applied, pending }: SetupStatus): boolean {
  // A new app waits for its first setup output; an applied one stays after GitHub deletes its run.
  if (latestRun === null) {
    return applied !== null;
  }
  return !(applied === null && pending.state === "deployed" && pending.firstApply.automatic);
}

const linkClassName = "font-medium text-foreground underline underline-offset-4";

/**
The run of the newest setup output, or the wait for the first one with the repository's Actions
page. An applied output whose run GitHub deleted shows no headline.
*/
function SetupStackHeadline({
  status,
  githubRepositoryFullName,
}: {
  status: SetupStatus;
  githubRepositoryFullName: string;
}) {
  const { latestRun } = status;
  if (latestRun === null) {
    return status.applied === null ? (
      <p className="text-muted-foreground">
        Waiting for the setup output from{" "}
        <a
          className={linkClassName}
          href={`https://github.com/${githubRepositoryFullName}/actions`}
          rel="noreferrer noopener"
          target="_blank"
        >
          GitHub Actions
        </a>
        .
      </p>
    ) : null;
  }
  const runLink = (
    <a className={linkClassName} href={latestRun.url} rel="noreferrer noopener" target="_blank">
      run {latestRun.runId}
    </a>
  );
  return status.pending.state === "failed" ? (
    <p className="text-muted-foreground">Setup failed in {runLink}.</p>
  ) : (
    <p className="text-muted-foreground">
      Setup stack: {runLink} {latestRun.conclusion === "success" ? "succeeded" : "failed"}.
    </p>
  );
}

/**
The setup status of a repository that its GitHub Actions set up, once Samebase's own setup finished:
the run of the newest setup output, the setup output that waits for a member's apply, and the last
automatic apply that failed. The status is a live GitHub, Cloudflare, and Convex read, so it renders
nothing until it loads.
*/
export function RepositorySetupStackStatus({ repository }: { repository: UserRepositoryResult }) {
  const { repositoryId, providerPlan, githubRepositoryFullName } = repository;
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
    // The read lists the setup output artifacts, reads their runs, and checks every claim with
    // Cloudflare and Convex.
    staleTime: 60 * 1000,
    // GitHub does not push new artifacts, and the status read lists no runs, so it cannot tell
    // whether a run is publishing a newer output. The open overview reads every 30 seconds while
    // the first setup output has not arrived or observeFirstSetupOutput may still apply it, and
    // every 2 minutes otherwise, so a later run's output appears without a reload.
    refetchInterval: (query) =>
      query.state.data && isSetupStatusSettled(query.state.data) ? 2 * 60 * 1000 : 30 * 1000,
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
      <SetupStackHeadline status={status} githubRepositoryFullName={githubRepositoryFullName} />
      {status.applyFailure ? (
        <p className="text-xs leading-5 text-red-700" role="alert">
          Automatic apply failed: {status.applyFailure.reason}
        </p>
      ) : null}
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
