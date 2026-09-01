import { AppDialogContent } from "@/components/AppDialogContent";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { INCLUDE_SCRUBBED_QUERY_PARAM } from "@/routeSearch/adminUsers";
import { applySearchPatch } from "@/routing/searchFlags";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const adminUsersRouteApi = getRouteApi("/admin/users");
const INCLUDE_SCRUBBED_CHECKBOX_ID = "admin-users-include-scrubbed";

type DeleteTarget = {
  deletionStartMode: FunctionReturnType<typeof api.accountDeletion.index.policy>;
  email: string;
  userId: Id<"users">;
};

export function AdminUsersPage() {
  const navigate = adminUsersRouteApi.useNavigate();
  const search = adminUsersRouteApi.useSearch();
  const includeScrubbed = search[INCLUDE_SCRUBBED_QUERY_PARAM] ?? false;
  const { results, status, loadMore } = usePaginatedQuery(
    api.accountDeletion.index.listUsersForAdmin,
    { includeScrubbed },
    { initialNumItems: 25 },
  );
  const policy = useQuery(api.accountDeletion.index.policy);
  const queueUserDeletion = useMutation(api.accountDeletion.index.queueUserDeletionForAdmin);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [pendingUserId, setPendingUserId] = useState<Id<"users"> | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (deleteTarget === null || pendingUserId !== null) {
      return;
    }

    setPendingUserId(deleteTarget.userId);
    setDeleteError(null);
    try {
      await queueUserDeletion({
        deletionStartMode: deleteTarget.deletionStartMode,
        userId: deleteTarget.userId,
      });
      setDeleteTarget(null);
    } catch {
      setDeleteError("Could not queue account deletion. Please try again.");
    } finally {
      setPendingUserId(null);
    }
  };

  return (
    <main
      data-testid="admin-users-page"
      data-posthog-mask
      className="container mx-auto w-full max-w-6xl py-6"
    >
      <h1 className="text-xl font-semibold @2xl:text-2xl">Users</h1>
      <div className="mt-6 flex items-center gap-2">
        <Checkbox
          checked={includeScrubbed}
          id={INCLUDE_SCRUBBED_CHECKBOX_ID}
          onCheckedChange={(checked) => {
            void navigate({
              replace: true,
              resetScroll: false,
              search: (currentSearch) =>
                applySearchPatch(currentSearch, {
                  [INCLUDE_SCRUBBED_QUERY_PARAM]: checked === true ? true : null,
                }),
              to: ".",
            });
          }}
        />
        <Label htmlFor={INCLUDE_SCRUBBED_CHECKBOX_ID}>Include scrubbed users</Label>
      </div>
      <div className="mt-6 overflow-x-auto border-t">
        <table className="w-full min-w-3xl text-left text-sm">
          <thead className="border-b">
            <tr>
              <th className="py-3 pr-4 font-medium">Account</th>
              <th className="py-3 pr-4 font-medium">Sign-in</th>
              <th className="py-3 pr-4 font-medium">State</th>
              <th className="py-3 pr-4 font-medium">Created</th>
              <th className="py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {results.map((user) => (
              <tr key={user.userId} className="border-b">
                <td className="py-3 pr-4 [overflow-wrap:anywhere]">{user.email ?? "Scrubbed"}</td>
                <td className="py-3 pr-4">{user.providers.join(", ") || "None"}</td>
                <td className="py-3 pr-4">
                  {user.state === "deleting"
                    ? "Deleting"
                    : user.isApproved
                      ? "Approved"
                      : "Pending"}
                </td>
                <td className="py-3 pr-4">{new Date(user.createdAt).toLocaleString()}</td>
                <td className="py-3">
                  {user.isCurrentUser ? (
                    <Link
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                      to="/settings"
                    >
                      Settings
                    </Link>
                  ) : (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={
                        policy === undefined || pendingUserId !== null || user.state !== "active"
                      }
                      onClick={() => {
                        if (policy === undefined || user.email === undefined) {
                          return;
                        }
                        setDeleteTarget({
                          deletionStartMode: policy,
                          email: user.email,
                          userId: user.userId,
                        });
                        setDeleteError(null);
                      }}
                    >
                      {user.state === "active"
                        ? "Delete"
                        : user.state === "deleting"
                          ? "Deleting"
                          : "Deleted"}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {status === "LoadingFirstPage" ? null : results.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No users.</p>
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

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && pendingUserId === null) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <AppDialogContent showCloseButton={pendingUserId === null}>
          <DialogHeader>
            <DialogTitle>Delete account?</DialogTitle>
            <DialogDescription>
              This disables {deleteTarget?.email} now.{" "}
              {deleteTarget?.deletionStartMode === "immediate"
                ? "Permanent deletion starts immediately."
                : "Permanent deletion starts in seven days."}
            </DialogDescription>
          </DialogHeader>
          {deleteError === null ? null : (
            <p className="text-sm text-destructive" role="alert">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pendingUserId !== null}
              onClick={() => {
                setDeleteTarget(null);
                setDeleteError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pendingUserId !== null}
              onClick={() => void handleDelete()}
            >
              {pendingUserId === null ? (
                "Delete"
              ) : (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Queuing...
                </>
              )}
            </Button>
          </DialogFooter>
        </AppDialogContent>
      </Dialog>
    </main>
  );
}
