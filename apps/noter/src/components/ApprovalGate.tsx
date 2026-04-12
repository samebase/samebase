import { useNoterAuthActions } from "@/authClient";
import { Button } from "@/components/ui/button";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { api } from "../../convex/_generated/api";

export function ApprovalGate({ children }: { children: ReactNode }) {
  const isApproved = useQuery(api.users.isCurrentUserApproved);
  const { signOut } = useNoterAuthActions();

  // Avoid flashing gated content before approval state is known.
  if (isApproved === undefined) {
    return null;
  }

  if (!isApproved) {
    return (
      <div className="container my-auto">
        <div className="mx-auto flex max-w-[384px] flex-col items-center gap-4 py-16 text-center">
          <h2 className="text-xl font-semibold tracking-tight">
            You're on the waitlist
          </h2>
          <p className="text-sm text-muted-foreground">
            We'll let you know when your spot opens up.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void signOut();
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
