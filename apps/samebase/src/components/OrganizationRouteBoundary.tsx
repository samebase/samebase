import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { AuthorizationErrorNotice } from "@/components/AuthorizationErrorNotice";
import {
  findViewerOrganization,
  useOrganizationContext,
  type ViewerOrganization,
} from "@/lib/organizationContext";
import { Button } from "@/components/ui/button";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { Link } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";

function OrganizationUnavailable({
  authorizationErrorMessage,
  owner,
}: {
  authorizationErrorMessage?: ReactNode;
  owner: string;
}) {
  return (
    <main className="container mx-auto w-full max-w-2xl py-6">
      <h1 className="text-xl font-semibold @2xl:text-2xl">Organization unavailable</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        You do not have Samebase access to {owner}.
      </p>
      {authorizationErrorMessage ? (
        <div className="mt-3">
          <AuthorizationErrorNotice>{authorizationErrorMessage}</AuthorizationErrorNotice>
        </div>
      ) : null}
      <Button asChild className="mt-6" variant="outline">
        <Link to={DASHBOARD_ROUTE}>All vaults</Link>
      </Button>
    </main>
  );
}

export function OrganizationRouteBoundary({
  authorizationErrorMessage,
  children,
  owner,
}: {
  authorizationErrorMessage?: ReactNode;
  children: (organization: ViewerOrganization) => ReactNode;
  owner: string;
}) {
  const { organizations } = useOrganizationContext();
  if (organizations === undefined) {
    return null;
  }

  const organization = findViewerOrganization(organizations, owner);
  if (organization === null) {
    return (
      <OrganizationUnavailable
        authorizationErrorMessage={authorizationErrorMessage}
        owner={owner}
      />
    );
  }
  return <Fragment key={organization.organizationId}>{children(organization)}</Fragment>;
}

export function AuthenticatedOrganizationRoutePage({
  authorizationErrorMessage,
  children,
  owner,
}: {
  authorizationErrorMessage?: ReactNode;
  children: (organization: ViewerOrganization) => ReactNode;
  owner: string;
}) {
  return (
    <AuthenticatedAppRoutePage>
      <OrganizationRouteBoundary
        authorizationErrorMessage={authorizationErrorMessage}
        owner={owner}
      >
        {children}
      </OrganizationRouteBoundary>
    </AuthenticatedAppRoutePage>
  );
}
