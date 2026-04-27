import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import type { UserPermission } from "../../shared/userPermissions";
import { hasUserPermission } from "../../shared/userPermissions";

function NotFoundPermissionState() {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });

  return (
    <div className="container my-auto">
      <div
        data-testid="permission-gate-not-found"
        className="mx-auto flex max-w-[384px] flex-col items-center gap-4 py-16 text-center"
      >
        <h2 className="text-xl font-semibold tracking-tight">Page not found</h2>
        <p className="text-sm text-muted-foreground">
          The requested noter app route does not exist.
        </p>
        <code className="max-w-full overflow-x-auto text-xs text-muted-foreground">
          {pathname}
        </code>
        <Button asChild variant="outline">
          <Link to="/">Go to vaults</Link>
        </Button>
      </div>
    </div>
  );
}

export function PermissionGate({
  children,
  requiredPermission,
}: {
  children: ReactNode;
  requiredPermission?: UserPermission;
}) {
  const currentUserAccess = useQuery(
    api.permissions.currentUserAccess,
    requiredPermission ? {} : "skip",
  );

  if (!requiredPermission) {
    return <>{children}</>;
  }

  if (currentUserAccess === undefined) {
    return null;
  }

  if (!hasUserPermission(currentUserAccess.permissions, requiredPermission)) {
    return <NotFoundPermissionState />;
  }

  return <>{children}</>;
}
