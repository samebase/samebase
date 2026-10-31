import { Button } from "@/components/ui/button";
import { repositoryExternalDataQueryKey } from "@/repository/dashboard/repositoryExternalDataQueryKey";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import { isSamebaseManagedProviderPlan } from "../../../convex/repository/provisioningPlan";

/**
The first deployment of a repository that its GitHub Actions set up, once Samebase's own setup
finished. It shows while the team's Alchemy state store has no output for the repository's `prod`
stage. The store tells no failed run from a running one, so the line links the repository's Actions
page. A read that fails after an in-progress read keeps that line: a team's first run creates the
store, and a store in the middle of that fails a read.
*/
export function RepositorySetupStackStatus({
  repository,
}: {
  repository: Pick<
    UserRepositoryResult,
    "deletion" | "githubRepositoryFullName" | "providerPlan" | "providerSetup" | "repositoryId"
  >;
}) {
  const { repositoryId, providerPlan, githubRepositoryFullName } = repository;
  const enabled =
    repository.providerSetup.status === "ready" &&
    repository.deletion.state === "not_deleting" &&
    providerPlan !== null &&
    !isSamebaseManagedProviderPlan(providerPlan);
  const readStatus = useAction(api.repository.alchemyState.readSetupStatus);
  const statusQuery = useQuery({
    queryKey: [...repositoryExternalDataQueryKey(repositoryId), "setup-stack"],
    queryFn: () => readStatus({ repositoryId }),
    enabled,
    staleTime: 30 * 1000,
    // The team store exists only after the first run creates it, so this read, not a subscription
    // to the store, sees the first deployment finish. A done status does not change back.
    refetchInterval: (query) => (query.state.data?.state === "done" ? false : 30 * 1000),
    retry: false,
  });

  if (!enabled) {
    return null;
  }
  const status = statusQuery.data;
  if (statusQuery.isError && !status) {
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
  if (status?.state !== "in_progress") {
    return null;
  }

  return (
    <section aria-label="Setup stack" className="text-sm">
      <p className="text-muted-foreground">
        The first deployment is in progress in{" "}
        <a
          className="font-medium text-foreground underline underline-offset-4"
          href={`https://github.com/${githubRepositoryFullName}/actions`}
          rel="noreferrer noopener"
          target="_blank"
        >
          GitHub Actions
        </a>
        .
      </p>
    </section>
  );
}
