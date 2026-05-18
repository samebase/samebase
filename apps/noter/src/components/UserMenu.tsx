import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PersonIcon } from "@/lib/radixIcons";
import { formatAuthProviderLabel } from "@/lib/authProviderLabel";
import { api } from "../../convex/_generated/api";
import { useQuery } from "convex/react";
import { ReactNode, useMemo, useState } from "react";
import { useNoterAuthActions } from "@/authClient";

export function UserMenu({
  children,
  menuLabel,
}: {
  children?: ReactNode;
  menuLabel?: ReactNode;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const viewer = useQuery(api.users.viewer);
  const authProviders = useQuery(api.users.getViewerAuthProviders);
  const providerLabel = useMemo(() => {
    const provider =
      authProviders?.primaryProvider ?? authProviders?.providers[0];
    return formatAuthProviderLabel(provider);
  }, [authProviders?.primaryProvider, authProviders?.providers]);
  const emailLabel = viewer?.email ?? "Unknown";

  return (
    <div
      className={
        "flex items-center gap-2 text-sm font-medium w-full min-w-0 justify-between"
      }
    >
      {children}
      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Account</DialogTitle>
            <DialogDescription>
              Sign-in details for this session.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Sign-in method</span>
              <span className="font-medium">{providerLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{emailLabel}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8 rounded-ui md:h-6 md:w-6"
          >
            <PersonIcon className="h-4 w-4 md:h-3 md:w-3" />
            <span className="sr-only">Open user menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{menuLabel ?? children}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setAccountOpen(true)}
            disabled={!viewer}
          >
            Account details
          </DropdownMenuItem>
          <SignOutButton />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SignOutButton() {
  const { signOut } = useNoterAuthActions();
  return (
    <DropdownMenuItem
      onClick={() => {
        void signOut();
      }}
    >
      Sign out
    </DropdownMenuItem>
  );
}
