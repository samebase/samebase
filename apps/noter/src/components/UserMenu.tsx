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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthActions } from "@convex-dev/auth/react";
import { PersonIcon } from "@radix-ui/react-icons";
import { api } from "../../convex/_generated/api";
import { useQuery } from "convex/react";
import { ReactNode, useMemo, useState } from "react";
import { clsx } from "clsx";
import { clearAuthFlag } from "@/SignInForm";

function formatProviderLabel(provider: string | undefined): string {
  if (!provider) return "Unknown";
  if (provider === "google") return "Google";
  if (provider === "github") return "GitHub";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function UserMenu({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const viewer = useQuery(api.users.viewer);
  const authProviders = useQuery(api.users.getViewerAuthProviders);
  const providerLabel = useMemo(() => {
    const provider =
      authProviders?.primaryProvider ?? authProviders?.providers[0];
    return formatProviderLabel(provider);
  }, [authProviders?.primaryProvider, authProviders?.providers]);
  const emailLabel = viewer?.email ?? "Unknown";

  return (
    <div
      className={clsx("flex items-center gap-2 text-sm font-medium", className)}
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
          <Button variant="secondary" size="icon" className="rounded-full">
            <PersonIcon className="h-5 w-5" />
            <span className="sr-only">Toggle user menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{children}</DropdownMenuLabel>
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
  const { signOut } = useAuthActions();
  return (
    <DropdownMenuItem
      onClick={() => {
        clearAuthFlag();
        void signOut();
      }}
    >
      Sign out
    </DropdownMenuItem>
  );
}
