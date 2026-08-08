import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { AuthorizationErrorNotice } from "@/components/AuthorizationErrorNotice";
import {
  findViewerOrganization,
  useOrganizationContext,
  type ViewerOrganization,
} from "@/lib/organizationContext";
import { Button } from "@/components/ui/button";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { buildOrganizationRoutePath } from "@/lib/organizationRoutes";
import { Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useRef, type ReactNode } from "react";

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
  const navigate = useNavigate();
  const { organizations, surface } = useOrganizationContext();
  const activeOrganizationRouteRef = useRef<{
    normalizedOwner: string;
    organizationId: ViewerOrganization["organizationId"];
  } | null>(null);
  const normalizedOwner = owner.trim().toLowerCase();
  const activeOrganizationRoute =
    activeOrganizationRouteRef.current?.normalizedOwner === normalizedOwner
      ? activeOrganizationRouteRef.current
      : null;
  const organization =
    organizations === undefined
      ? null
      : activeOrganizationRoute === null
        ? findViewerOrganization(organizations, owner)
        : (organizations.find(
            (candidate) => candidate.organizationId === activeOrganizationRoute.organizationId,
          ) ?? null);
  const renamedOrganizationPath =
    organization !== null &&
    surface.kind === "organization" &&
    surface.source === "organization" &&
    organization.githubOwnerLogin !== owner
      ? buildOrganizationRoutePath({
          owner: organization.githubOwnerLogin,
          section: surface.section,
        })
      : null;

  useEffect(() => {
    if (organizations === undefined || activeOrganizationRoute !== null) {
      return;
    }
    activeOrganizationRouteRef.current =
      organization === null
        ? null
        : {
            normalizedOwner,
            organizationId: organization.organizationId,
          };
  }, [activeOrganizationRoute, normalizedOwner, organization, organizations]);

  useEffect(() => {
    if (renamedOrganizationPath === null) {
      return;
    }
    void navigate({
      hash: true,
      replace: true,
      resetScroll: false,
      search: (currentSearch) => currentSearch,
      to: renamedOrganizationPath,
    });
  }, [navigate, renamedOrganizationPath]);

  if (organizations === undefined) {
    return null;
  }

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
