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
  const { results, status, loadMore } = usePaginatedQuery(
    api.accountDeletion.index.listForAdmin,
    {},
    { initialNumItems: 25 },
  );
  const [selectedRunId, setSelectedRunId] = useState<Id<"workflow_accountDeletion_runs"> | null>(
    null,
  );
  const detail = useQuery(
    api.accountDeletion.index.detailForAdmin,
    selectedRunId === null ? "skip" : { runId: selectedRunId },
  );
  const retry = useMutation(api.accountDeletion.index.retry);
  const restore = useMutation(api.accountDeletion.index.restore);
  const deleteNow = useMutation(api.accountDeletion.index.deleteNow);
  const [pendingAction, setPendingAction] = useState<"delete_now" | "restore" | "retry" | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const handleRetry = async (runId: Id<"workflow_accountDeletion_runs">) => {
    if (pendingAction !== null) {
      return;
    }
    setPendingAction("retry");
    setActionError(null);
    try {
      await retry({ runId });
    } catch {
      setActionError("Could not retry account deletion. Please try again.");
    } finally {
      setPendingAction(null);
    }
  };

  const handleQueuedAction = async (
    action: "delete_now" | "restore",
    runId: Id<"workflow_accountDeletion_runs">,
  ) => {
    if (pendingAction !== null) {
      return;
    }
    setPendingAction(action);
    setActionError(null);
    try {
      if (action === "restore") {
        await restore({ runId });
        setSelectedRunId((selected) => (selected === runId ? null : selected));
      } else {
        await deleteNow({ runId });
      }
    } catch {
      setActionError(
        action === "restore"
          ? "Could not restore the account. Please try again."
          : "Could not start account deletion. Please try again.",
      );
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <main
      data-testid="admin-account-deletions-page"
      data-posthog-mask
      className="container mx-auto w-full max-w-6xl py-6"
    >
      <h1 className="text-xl font-semibold @2xl:text-2xl">Account deletions</h1>
      <div className="mt-8 overflow-x-auto border-t">
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
            {results.map((run) => (
              <tr key={run.runId} className="border-b">
                <td className="py-3 pr-4">
                  <button
                    type="button"
                    className="font-mono text-xs underline underline-offset-4"
                    aria-pressed={selectedRunId === run.runId}
                    onClick={() => {
                      setSelectedRunId(run.runId);
                      setActionError(null);
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
      {status === "LoadingFirstPage" ? null : results.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No account deletions.</p>
      ) : null}
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(25)}
        >
          {status === "LoadingMore" ? "Loading..." : "Load more"}
        </Button>
      ) : null}

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
            {detail.run.state === "queued" ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pendingAction !== null}
                  onClick={() => void handleQueuedAction("restore", detail.run.runId)}
                >
                  {pendingAction === "restore" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Restoring...
                    </>
                  ) : (
                    "Restore account"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pendingAction !== null}
                  onClick={() => void handleQueuedAction("delete_now", detail.run.runId)}
                >
                  {pendingAction === "delete_now" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    "Delete now"
                  )}
                </Button>
              </div>
            ) : detail.run.state === "needs_attention" ? (
              <Button
                type="button"
                disabled={pendingAction !== null}
                onClick={() => void handleRetry(detail.run.runId)}
              >
                {pendingAction === "retry" ? (
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
          {actionError === null ? null : (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {actionError}
            </p>
          )}
          <dl className="mt-6 space-y-4">
            <OutcomeState label="Operation" state={detail.run.runId} />
            <OutcomeState label="Account" state={detail.run.email ?? "Scrubbed"} />
            {detail.run.state === "queued" ? (
              <OutcomeState
                label="Deletion starts"
                state={new Date(detail.run.deletionStartsAt).toLocaleString()}
              />
            ) : null}
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
    </main>
  );
}
