import { useState } from "react";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useRouter } from "@tanstack/react-router";

import { api } from "../../convex/_generated/api";
import { ACCOUNT_DELETION_CONFIRMATION_PHRASE } from "../../shared/accountDeletionPhrase";
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
import { ACCOUNT_DELETION_ROUTE } from "@/lib/accountDeletionRoute";
import {
  createAccountDeletionCompletionCapability,
  readAccountDeletionBrowserMarker,
  writeAccountDeletionBrowserMarker,
} from "@/lib/accountDeletionBrowserState";

export function AccountDeletionDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const requestAccountDeletion = useMutation(api.accountDeletion.index.request);
  const [isRequestingDeletion, setIsRequestingDeletion] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [confirmationInput, setConfirmationInput] = useState("");

  const handleDeleteAccount = async () => {
    if (isRequestingDeletion) {
      return;
    }

    setIsRequestingDeletion(true);
    setDeletionError(null);

    const completionCapability =
      readAccountDeletionBrowserMarker()?.completionCapability ??
      createAccountDeletionCompletionCapability();

    if (completionCapability === null || !writeAccountDeletionBrowserMarker(completionCapability)) {
      setDeletionError("Could not start account deletion. Please try again.");
      setIsRequestingDeletion(false);
      return;
    }

    try {
      const result = await requestAccountDeletion({
        completionCapability,
        deletionConfirmationText: confirmationInput,
      });
      if (result.state === "confirmation_mismatch") {
        setDeletionError(`Type ${ACCOUNT_DELETION_CONFIRMATION_PHRASE} to confirm.`);
        setIsRequestingDeletion(false);
        return;
      }
      if (result.state === "organization_membership_exists") {
        setDeletionError("Leave or delete every organization before you delete your account.");
        setIsRequestingDeletion(false);
        return;
      }

      writeAccountDeletionBrowserMarker(result.status.completionCapability);
      void router.navigate({ href: ACCOUNT_DELETION_ROUTE, replace: true });
    } catch {
      // A transport failure cannot prove that the request did not commit.
      setDeletionError("Could not start account deletion. Please try again.");
      setIsRequestingDeletion(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isRequestingDeletion) {
          onClose();
        }
      }}
    >
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle>Delete account?</DialogTitle>
          <DialogDescription className="space-y-2 text-foreground">
            <span className="block font-medium">
              This permanently deletes your Samebase account and disconnects provider connections
              you added.
            </span>
            <span className="block text-muted-foreground">
              First, leave or delete every organization. GitHub repositories, Convex projects,
              Cloudflare Workers, and domains are not deleted.
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-2">
            <Label htmlFor="settings-delete-account-confirmation">Type the phrase to confirm</Label>
            <code className="block cursor-text bg-muted px-3 py-2 font-mono text-sm leading-6 [overflow-wrap:anywhere]">
              {ACCOUNT_DELETION_CONFIRMATION_PHRASE}
            </code>
            <Input
              id="settings-delete-account-confirmation"
              value={confirmationInput}
              autoComplete="off"
              disabled={isRequestingDeletion}
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
          <Button type="button" variant="outline" disabled={isRequestingDeletion} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={
              isRequestingDeletion || confirmationInput !== ACCOUNT_DELETION_CONFIRMATION_PHRASE
            }
            onClick={() => void handleDeleteAccount()}
          >
            {isRequestingDeletion ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete account"
            )}
          </Button>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}
