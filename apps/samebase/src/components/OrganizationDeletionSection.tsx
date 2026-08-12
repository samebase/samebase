import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { api } from "../../convex/_generated/api";
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
import { ORGANIZATION_MEMBERS_ROUTE } from "@/lib/organizationRoutes";

export type OrganizationDeletionSettings = NonNullable<
  (typeof api.organizationDeletion.index.settings)["_returnType"]
>;

function OrganizationDeletionDialog({
  onClose,
  settings,
}: {
  onClose: () => void;
  settings: OrganizationDeletionSettings;
}) {
  const requestDeletion = useMutation(api.organizationDeletion.index.request);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (isRequesting || confirmationInput !== settings.confirmationPhrase) {
      return;
    }
    setIsRequesting(true);
    setError(null);
    try {
      const result = await requestDeletion({
        organizationId: settings.organizationId,
        confirmationPhrase: confirmationInput,
      });
      if (result.state === "confirmation_mismatch") {
        setError(`Type ${settings.confirmationPhrase} to confirm.`);
        setIsRequesting(false);
        return;
      }
      if (result.state === "shared_organization") {
        setError("Samebase will not delete a shared organization.");
        setIsRequesting(false);
        return;
      }
      if (result.state === "rollout_pending") {
        setError("Organization deletion is temporarily unavailable.");
        setIsRequesting(false);
        return;
      }
      onClose();
    } catch {
      setError("Could not start organization deletion. Check the status and try again.");
      setIsRequesting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isRequesting) {
          onClose();
        }
      }}
    >
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle>Delete organization?</DialogTitle>
          <DialogDescription className="space-y-2 text-foreground">
            <span className="block font-medium">
              Samebase will permanently delete this organization, its vault records, staged changes,
              provider connections, billing state, and saved settings.
            </span>
            <span className="block text-muted-foreground">
              GitHub repositories, Convex projects and deployments, Cloudflare Workers, and domains
              will stay online. Samebase will not uninstall or delete them.
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-2">
            <Label htmlFor="delete-organization-confirmation">Type the phrase to confirm</Label>
            <code className="block cursor-text select-all bg-muted px-3 py-2 font-mono text-sm leading-6 [overflow-wrap:anywhere]">
              {settings.confirmationPhrase}
            </code>
            <Input
              id="delete-organization-confirmation"
              autoComplete="off"
              disabled={isRequesting}
              value={confirmationInput}
              onChange={(event) => setConfirmationInput(event.target.value)}
            />
          </div>
          {error === null ? null : (
            <p className="text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isRequesting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isRequesting || confirmationInput !== settings.confirmationPhrase}
            onClick={() => void handleDelete()}
          >
            {isRequesting ? (
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

export function OrganizationDeletionSection({
  settings,
}: {
  settings: OrganizationDeletionSettings;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const deletion = settings.deletion;

  if (deletion.state === "not_owner") {
    return null;
  }

  return (
    <section className="mt-8 border-t pt-6" aria-labelledby="delete-organization-heading">
      <h2 id="delete-organization-heading" className="text-base font-semibold">
        Delete organization
      </h2>
      {deletion.state === "shared_organization" ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Samebase will not delete a shared organization. Leave or resolve ownership in{" "}
          <Link
            className="underline underline-offset-4"
            params={{ owner: settings.githubOwnerLogin }}
            to={ORGANIZATION_MEMBERS_ROUTE}
          >
            Members
          </Link>
          .
        </p>
      ) : deletion.state === "rollout_pending" ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Organization deletion is temporarily unavailable while Samebase completes a storage safety
          update.
        </p>
      ) : deletion.state === "running" ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          Samebase is deleting this organization. GitHub repositories, Convex projects and
          deployments, Cloudflare Workers, and domains stay online.
        </p>
      ) : deletion.state === "needs_attention" ? (
        <div className="mt-4 space-y-2 text-sm" role="alert">
          <p className="text-destructive">
            Samebase has not completed organization deletion. Staff attention is required.
          </p>
          <p className="text-muted-foreground">{deletion.latestSafeError}</p>
          <p className="text-muted-foreground">
            GitHub repositories, Convex projects and deployments, Cloudflare Workers, and domains
            stay online.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <Button type="button" variant="destructive" onClick={() => setDialogOpen(true)}>
            Delete organization
          </Button>
        </div>
      )}
      {dialogOpen ? (
        <OrganizationDeletionDialog settings={settings} onClose={() => setDialogOpen(false)} />
      ) : null}
    </section>
  );
}
