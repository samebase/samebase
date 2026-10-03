import { useState } from "react";
import { ConvexError } from "convex/values";
import { Loader2 } from "lucide-react";

import type {
  ActionConfirmation,
  ActionConfirmationRequest,
} from "../../../convex/repository/contracts/actionConfirmation";
import { AppDialogContent } from "@/components/AppDialogContent";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
The dashboard step of the server confirmation check (rfcs/125): the server's effect text, and its
acknowledgement sentence as a checkbox label. Confirm resends the request with the token and the
sentence; the parent closes the dialog when that call resolves.
*/
export function RepositoryActionConfirmationDialog({
  confirmLabel,
  onCancel,
  onConfirm,
  request,
  title,
}: {
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (confirmation: ActionConfirmation) => Promise<void>;
  request: ActionConfirmationRequest;
  title: string;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setIsConfirming(true);
    setError(null);
    try {
      await onConfirm({ token: request.token, acknowledgement: request.acknowledgement });
    } catch (confirmError) {
      setError(
        confirmError instanceof ConvexError && typeof confirmError.data === "string"
          ? confirmError.data
          : "Please try again.",
      );
      setIsConfirming(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen && !isConfirming) {
          onCancel();
        }
      }}
    >
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{request.effect}</DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-2">
          <Checkbox
            id="action-confirmation-acknowledgement"
            checked={acknowledged}
            onCheckedChange={(checked) => setAcknowledged(checked === true)}
            disabled={isConfirming}
            className="mt-0.5"
          />
          <label htmlFor="action-confirmation-acknowledgement" className="text-sm">
            {request.acknowledgement}
          </label>
        </div>
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isConfirming}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              void confirm();
            }}
            disabled={!acknowledged || isConfirming}
          >
            {isConfirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}
