import { AppDialogContent } from "@/components/AppDialogContent";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "@tanstack/react-router";
import { useMutation, usePaginatedQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type DeleteTarget = {
  email: string;
  userId: Id<"users">;
};

export function AdminUsersPage() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.accountDeletion.index.listUsersForAdmin,
    {},
    { initialNumItems: 25 },
  );
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
      await queueUserDeletion({ userId: deleteTarget.userId });
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
      <div className="mt-8 overflow-x-auto border-t">
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
                      disabled={pendingUserId !== null || user.state !== "active"}
                      onClick={() => {
                        if (user.email === undefined) {
                          return;
                        }
                        setDeleteTarget({ email: user.email, userId: user.userId });
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
              This disables {deleteTarget?.email} now. Permanent deletion starts in seven days.
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
