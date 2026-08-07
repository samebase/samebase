import { useMemo } from "react";
import { AppDialogContent } from "@/components/AppDialogContent";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  compareCloudflareAccountOptions,
  type CloudflareAccountOption,
} from "@/components/vault-dashboard/vaultDashboardCloudflareAccountOptions";
import { Loader2 } from "lucide-react";

export function VaultDashboardCloudflareAccountDialog({
  accounts,
  error,
  isLoading,
  isSubmitting,
  onAccountChange,
  onOpenChange,
  onSubmit,
  open,
  selectedAccountId,
}: {
  accounts: CloudflareAccountOption[];
  error: string | null;
  isLoading: boolean;
  isSubmitting: boolean;
  onAccountChange: (accountId: string) => void;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: () => void;
  open: boolean;
  selectedAccountId: string;
}) {
  const sortedAccounts = useMemo(
    () => [...accounts].sort(compareCloudflareAccountOptions),
    [accounts],
  );
  const selectedAccount = sortedAccounts.find((account) => account.accountId === selectedAccountId);
  const submitDisabled = isLoading || isSubmitting || !selectedAccountId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle>Select Cloudflare Account</DialogTitle>
          <DialogDescription>
            Choose the Cloudflare account for this organization.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={selectedAccountId} onValueChange={onAccountChange} disabled={isLoading}>
            <SelectTrigger aria-label="Cloudflare account" className="w-full">
              <SelectValue placeholder={isLoading ? "Loading accounts" : "Cloudflare account"}>
                {selectedAccount?.accountName}
              </SelectValue>
            </SelectTrigger>
            <AppSelectContent>
              {sortedAccounts.map((account) => (
                <AppSelectItem key={account.accountId} value={account.accountId}>
                  {account.accountName}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </Select>
          {error ? <div className="text-sm text-red-600">{error}</div> : null}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitDisabled}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Account
          </Button>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}
