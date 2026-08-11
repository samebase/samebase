import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

function OutcomeState({ label, state }: { label: string; state: string }) {
  return (
    <div className="grid gap-1 @2xl:grid-cols-[10rem_1fr] @2xl:gap-4">
      <dt className="text-sm font-medium">{label}</dt>
      <dd className="text-sm text-muted-foreground">{state}</dd>
    </div>
  );
}

export function AdminAccountDeletionsPage() {
  const {
    results: accountRuns,
    status: accountStatus,
    loadMore: loadMoreAccountRuns,
  } = usePaginatedQuery(api.accountDeletion.index.listForAdmin, {}, { initialNumItems: 25 });
  const {
    results: organizationRuns,
    status: organizationStatus,
    loadMore: loadMoreOrganizationRuns,
  } = usePaginatedQuery(api.organizationDeletion.index.listForAdmin, {}, { initialNumItems: 25 });
  const [selectedRunId, setSelectedRunId] = useState<Id<"workflow_accountDeletion_runs"> | null>(
    null,
  );
  const detail = useQuery(
    api.accountDeletion.index.detailForAdmin,
    selectedRunId === null ? "skip" : { runId: selectedRunId },
  );
  const retry = useMutation(api.accountDeletion.index.retry);
  const retryOrganizationDeletion = useMutation(api.organizationDeletion.index.retryForAdmin);
  const [retryingRunId, setRetryingRunId] = useState<Id<"workflow_accountDeletion_runs"> | null>(
    null,
  );
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retryingOrganizationRunId, setRetryingOrganizationRunId] =
    useState<Id<"workflow_organizationDeletion_runs"> | null>(null);
  const [organizationRetryError, setOrganizationRetryError] = useState<string | null>(null);

  const handleRetry = async (runId: Id<"workflow_accountDeletion_runs">) => {
    if (retryingRunId !== null) {
      return;
    }
    setRetryingRunId(runId);
    setRetryError(null);
    try {
      await retry({ runId });
    } catch {
      setRetryError("Could not retry account deletion. Please try again.");
    } finally {
      setRetryingRunId(null);
    }
  };

  const handleOrganizationRetry = async (runId: Id<"workflow_organizationDeletion_runs">) => {
    if (retryingOrganizationRunId !== null) {
      return;
    }
    setRetryingOrganizationRunId(runId);
    setOrganizationRetryError(null);
    try {
      await retryOrganizationDeletion({ runId });
    } catch {
      setOrganizationRetryError("Could not retry organization deletion. Please try again.");
    } finally {
      setRetryingOrganizationRunId(null);
    }
  };

  return (
    <main
      data-testid="admin-account-deletions-page"
      data-posthog-mask
      className="container mx-auto w-full max-w-6xl py-6"
    >
      <h1 className="text-xl font-semibold @2xl:text-2xl">Deletion operations</h1>
      <section className="mt-8" aria-labelledby="account-deletions-heading">
        <h2 id="account-deletions-heading" className="text-base font-semibold">
          Account deletions
        </h2>
        <div className="mt-4 overflow-x-auto border-t">
          <table className="w-full min-w-3xl text-left text-sm">
            <thead className="border-b">
              <tr>
                <th className="py-3 pr-4 font-medium">Operation</th>
                <th className="py-3 pr-4 font-medium">Account</th>
                <th className="py-3 pr-4 font-medium">State</th>
                <th className="py-3 pr-4 font-medium">Step</th>
                <th className="py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {accountRuns.map((run) => (
                <tr key={run.runId} className="border-b">
                  <td className="py-3 pr-4">
                    <button
                      type="button"
                      className="font-mono text-xs underline underline-offset-4"
                      aria-pressed={selectedRunId === run.runId}
                      onClick={() => {
                        setSelectedRunId(run.runId);
                        setRetryError(null);
                      }}
                    >
                      {run.runId}
                    </button>
                  </td>
                  <td className="py-3 pr-4">{run.email ?? "Scrubbed"}</td>
                  <td className="py-3 pr-4">{run.state.replace(/_/g, " ")}</td>
                  <td className="py-3 pr-4">{run.currentStep.replace(/_/g, " ")}</td>
                  <td className="py-3">{new Date(run.latestProgressAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {accountStatus === "LoadingFirstPage" ? null : accountRuns.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No account deletions.</p>
        ) : null}
        {accountStatus === "CanLoadMore" || accountStatus === "LoadingMore" ? (
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            disabled={accountStatus === "LoadingMore"}
            onClick={() => loadMoreAccountRuns(25)}
          >
            {accountStatus === "LoadingMore" ? "Loading..." : "Load more"}
          </Button>
        ) : null}
      </section>

      {selectedRunId === null ? null : detail === undefined ? null : detail === null ? (
        <p className="mt-8 text-sm text-destructive" role="alert">
          Account deletion operation not found.
        </p>
      ) : (
        <section className="mt-10 border-t pt-6" aria-labelledby="account-deletion-detail-heading">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 id="account-deletion-detail-heading" className="text-base font-semibold">
              Operation details
            </h2>
            {detail.run.state === "needs_attention" ? (
              <Button
                type="button"
                disabled={retryingRunId !== null}
                onClick={() => void handleRetry(detail.run.runId)}
              >
                {retryingRunId === detail.run.runId ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Retrying...
                  </>
                ) : (
                  "Retry"
                )}
              </Button>
            ) : null}
          </div>
          {retryError === null ? null : (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {retryError}
            </p>
          )}
          <dl className="mt-6 space-y-4">
            <OutcomeState label="Operation" state={detail.run.runId} />
            <OutcomeState label="Account" state={detail.run.email ?? "Scrubbed"} />
            <OutcomeState
              label="Provider revocation"
              state={detail.run.outcomes.providerRevocation.state.replace(/_/g, " ")}
            />
            {detail.run.outcomes.providerRevocation.state === "completed" ? (
              <>
                <OutcomeState
                  label="GitHub user authorization"
                  state={detail.run.outcomes.providerRevocation.githubUserAuthorization.state.replace(
                    /_/g,
                    " ",
                  )}
                />
                <OutcomeState
                  label="Cloudflare connections"
                  state={detail.run.outcomes.providerRevocation.cloudflareConnections.state.replace(
                    /_/g,
                    " ",
                  )}
                />
                <OutcomeState
                  label="Convex connections"
                  state={detail.run.outcomes.providerRevocation.convexConnections.state.replace(
                    /_/g,
                    " ",
                  )}
                />
                {detail.run.outcomes.providerRevocation.convexConnections.state ===
                "manual_revocation_required" ? (
                  <OutcomeState
                    label="Convex notice"
                    state={detail.run.outcomes.providerRevocation.convexConnections.safeNotice}
                  />
                ) : null}
              </>
            ) : null}
            <OutcomeState
              label="Completion email"
              state={detail.run.outcomes.completionEmail.state.replace(/_/g, " ")}
            />
            {detail.run.outcomes.completionEmail.state === "delivery_failed" ? (
              <OutcomeState
                label="Completion email error"
                state={detail.run.outcomes.completionEmail.safeError}
              />
            ) : null}
            <OutcomeState label="Retries" state={`${detail.run.retryCount}`} />
          </dl>
          {detail.run.latestSafeError === undefined ? null : (
            <p className="mt-6 text-sm text-destructive" role="alert">
              {detail.run.latestSafeError}
            </p>
          )}
          <h3 className="mt-8 text-sm font-semibold">Events</h3>
          <ol className="mt-3 divide-y border-y">
            {detail.events.map((event, index) => (
              <li key={`${event.createdAt}-${index}`} className="py-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span>{event.message}</span>
                  <time className="text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString()}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-12 border-t pt-6" aria-labelledby="organization-deletions-heading">
        <h2 id="organization-deletions-heading" className="text-base font-semibold">
          Organization deletions
        </h2>
        <div className="mt-4 overflow-x-auto border-t">
          <table className="w-full min-w-3xl text-left text-sm">
            <thead className="border-b">
              <tr>
                <th className="py-3 pr-4 font-medium">Operation</th>
                <th className="py-3 pr-4 font-medium">Organization</th>
                <th className="py-3 pr-4 font-medium">State</th>
                <th className="py-3 pr-4 font-medium">Step</th>
                <th className="py-3 pr-4 font-medium">Updated</th>
                <th className="py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {organizationRuns.map((run) => (
                <tr key={run.runId} className="border-b">
                  <td className="py-3 pr-4 font-mono text-xs">{run.runId}</td>
                  <td className="py-3 pr-4">{run.githubOwnerLogin ?? "Scrubbed"}</td>
                  <td className="py-3 pr-4">
                    <span>{run.state.replace(/_/g, " ")}</span>
                    {run.latestSafeError === undefined ? null : (
                      <p className="mt-1 max-w-sm text-destructive" role="alert">
                        {run.latestSafeError}
                      </p>
                    )}
                  </td>
                  <td className="py-3 pr-4">{run.currentStep.replace(/_/g, " ")}</td>
                  <td className="py-3 pr-4">{new Date(run.latestProgressAt).toLocaleString()}</td>
                  <td className="py-3">
                    {run.state === "needs_attention" ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={retryingOrganizationRunId !== null}
                        onClick={() => void handleOrganizationRetry(run.runId)}
                      >
                        {retryingOrganizationRunId === run.runId ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Retrying...
                          </>
                        ) : (
                          "Retry"
                        )}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {organizationStatus === "LoadingFirstPage" ? null : organizationRuns.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No organization deletions.</p>
        ) : null}
        {organizationStatus === "CanLoadMore" || organizationStatus === "LoadingMore" ? (
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            disabled={organizationStatus === "LoadingMore"}
            onClick={() => loadMoreOrganizationRuns(25)}
          >
            {organizationStatus === "LoadingMore" ? "Loading..." : "Load more"}
          </Button>
        ) : null}
        {organizationRetryError === null ? null : (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {organizationRetryError}
          </p>
        )}
      </section>
    </main>
  );
}
