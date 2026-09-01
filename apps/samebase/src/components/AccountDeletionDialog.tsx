import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
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

type AccountDeletionStartMode = FunctionReturnType<typeof api.accountDeletion.index.policy>;

export function AccountDeletionDialog({ onClose }: { onClose: () => void }) {
  const policy = useQuery(api.accountDeletion.index.policy);
  if (policy === undefined) {
    return null;
  }

  return <PolicyBoundAccountDeletionDialog initialPolicy={policy} onClose={onClose} />;
}

function PolicyBoundAccountDeletionDialog({
  initialPolicy,
  onClose,
}: {
  initialPolicy: AccountDeletionStartMode;
  onClose: () => void;
}) {
  const router = useRouter();
  const [confirmedPolicy] = useState(initialPolicy);
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
        deletionStartMode: confirmedPolicy,
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

  const startsImmediately = confirmedPolicy === "immediate";

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
              Your account will be disabled now. Permanent deletion will start{" "}
              {startsImmediately ? "immediately" : "seven days"} after you continue.
            </span>
            <span className="block text-muted-foreground">
              {startsImmediately
                ? null
                : "During those seven days, email contact@samebase.com to restore your account or for other inquiries. "}
              Samebase will send you a confirmation email as account deletion finishes.
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
                {startsImmediately ? "Deleting..." : "Scheduling..."}
              </>
            ) : startsImmediately ? (
              "Delete account"
            ) : (
              "Schedule deletion"
            )}
          </Button>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}
