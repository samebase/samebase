import { useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { Loader2 } from "lucide-react";
import { useRouter } from "@tanstack/react-router";

import { api } from "../../convex/_generated/api";
import type { ViewerOrganization } from "@/lib/organizationContext";
import { AppDialogContent } from "@/components/AppDialogContent";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function readDeletionError(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return "Could not delete the organization. Please try again.";
}

export function OrganizationDeletionDialog({
  onClose,
  organization,
}: {
  onClose: () => void;
  organization: ViewerOrganization;
}) {
  const router = useRouter();
  const deleteOrganization = useMutation(api.organizations.deleteOrganization);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (isDeleting) {
      return;
    }

    setIsDeleting(true);
    setDeletionError(null);
    try {
      await deleteOrganization({
        organizationId: organization.organizationId,
        deletionConfirmationText: confirmationInput,
      });
      await router.navigate({ href: "/repo", replace: true });
    } catch (error) {
      setDeletionError(readDeletionError(error));
      setIsDeleting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isDeleting) {
          onClose();
        }
      }}
    >
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle>Delete organization?</DialogTitle>
          <DialogDescription className="space-y-2 text-foreground">
            <span className="block font-medium">
              This permanently deletes the {organization.githubOwnerLogin} organization and its
              Samebase data.
            </span>
            <span className="block text-muted-foreground">
              Remove every Samebase repository and every other member first. GitHub repositories,
              projects, Cloudflare Workers, and domains are not deleted.
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-2">
            <Label htmlFor="organization-delete-confirmation">
              Type the organization name to confirm
            </Label>
            <code className="block cursor-text bg-muted px-3 py-2 font-mono text-sm leading-6 [overflow-wrap:anywhere]">
              {organization.githubOwnerLogin}
            </code>
            <Input
              id="organization-delete-confirmation"
              value={confirmationInput}
              autoComplete="off"
              disabled={isDeleting}
              onChange={(event) => setConfirmationInput(event.target.value)}
            />
          </div>
          {deletionError === null ? null : (
            <p className="text-destructive" role="alert">
              {deletionError}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isDeleting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isDeleting || confirmationInput !== organization.githubOwnerLogin}
            onClick={() => void handleDelete()}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete organization"
            )}
          </Button>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}
