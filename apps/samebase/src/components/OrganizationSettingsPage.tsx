import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAction, useQuery as useConvexQuery } from "convex/react";

import type { ViewerOrganization } from "@/lib/organizationContext";
import { OrganizationBillingSection } from "@/components/OrganizationBillingSection";
import { OrganizationDeletionDialog } from "@/components/OrganizationDeletionDialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { linkStyle } from "@/components/styles";
import {
  organizationGitHubIdentityQueryKey,
  type OrganizationGitHubIdentityObservation,
  useOrganizationGitHubIdentities,
} from "@/hooks/useOrganizationGitHubIdentity";
import { buildOrganizationRoutePath, ORGANIZATION_PROVIDERS_ROUTE } from "@/lib/organizationRoutes";
import type { OrganizationBillingSearch } from "@/routeSearch/organizationBilling";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ConvexDeploymentRegionField,
  type ConvexDeploymentRegionOption,
} from "@/components/ConvexDeploymentRegionField";
import { useConvexDeploymentRegions } from "@/components/useConvexDeploymentRegions";
import {
  formatConvexDeploymentRegion,
  type ConvexDeploymentRegion,
} from "../../shared/convexDeploymentRegions";

type OrganizationIdentity = OrganizationGitHubIdentityObservation["owner"];

function OrganizationIdentityNotice({
  identity,
  organizationRole,
  updatePending,
  onUpdateName,
}: {
  identity: OrganizationIdentity | undefined;
  organizationRole: "member" | "owner";
  updatePending: boolean;
  onUpdateName: () => void;
}) {
  if (!identity || identity.status === "current") {
    return null;
  }
  if (identity.status === "renamed") {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm" role="status">
        <div className="text-amber-800">
          <div>
            GitHub now uses <span className="font-medium">{identity.githubOwnerLogin}</span>.
          </div>
          {organizationRole !== "owner" ? (
            <div className="mt-1 text-xs">An organization owner must update this name.</div>
          ) : null}
        </div>
        {organizationRole === "owner" ? (
          <Button disabled={updatePending} size="sm" type="button" onClick={onUpdateName}>
            {updatePending ? "Updating..." : "Update name"}
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="mt-4 text-sm text-red-700" role="status">
      The GitHub App cannot access this organization.
    </div>
  );
}

function ConvexDeploymentRegionValue({
  value,
}: {
  value: ConvexDeploymentRegion | null | undefined;
}) {
  return (
    <dl className="space-y-1">
      <dt className="text-sm font-medium">Default production region for new Convex projects</dt>
      <dd className="text-sm text-muted-foreground">
        {value === undefined
          ? "Loading..."
          : value
            ? formatConvexDeploymentRegion(value)
            : "No saved default"}
      </dd>
      <dd className="text-xs text-muted-foreground">
        Used as the starting region when you create a Convex project.
      </dd>
    </dl>
  );
}

function ConvexDeploymentRegionSaveError({ message }: { message: string | null }) {
  return message ? (
    <div className="text-sm text-red-600" role="alert">
      {message}
    </div>
  ) : null;
}

function DisconnectedConvexDeploymentRegionSetting({
  defaultRegion,
  githubOwnerLogin,
  isSaving,
  onClear,
  saveError,
}: {
  defaultRegion: ConvexDeploymentRegion | null;
  githubOwnerLogin: string;
  isSaving: boolean;
  onClear: () => void;
  saveError: string | null;
}) {
  return (
    <div className="grid gap-3">
      <ConvexDeploymentRegionValue value={defaultRegion} />
      <div className="text-xs text-muted-foreground">
        Connect Convex in{" "}
        <Link
          className={linkStyle}
          params={{ owner: githubOwnerLogin }}
          to={ORGANIZATION_PROVIDERS_ROUTE}
        >
          Providers
        </Link>{" "}
        to choose a default.
      </div>
      <ConvexDeploymentRegionSaveError message={saveError} />
      {defaultRegion ? (
        <Button
          className="justify-self-start"
          disabled={isSaving}
          onClick={onClear}
          size="sm"
          type="button"
          variant="outline"
        >
          {isSaving ? "Clearing..." : "Clear default"}
        </Button>
      ) : null}
    </div>
  );
}

function ConnectedConvexDeploymentRegionSetting({
  changed,
  error,
  isFetching,
  isLoading,
  isSaving,
  onReload,
  onSave,
  onValueChange,
  regions,
  saveError,
  selectionUnavailable,
  value,
}: {
  changed: boolean;
  error: boolean;
  isFetching: boolean;
  isLoading: boolean;
  isSaving: boolean;
  onReload: () => void;
  onSave: () => void;
  onValueChange: (region: ConvexDeploymentRegion | null) => void;
  regions: readonly ConvexDeploymentRegionOption[];
  saveError: string | null;
  selectionUnavailable: boolean;
  value: ConvexDeploymentRegion | null;
}) {
  return (
    <div className="grid gap-3">
      <ConvexDeploymentRegionField
        allowNoSavedDefault
        description="Used as the starting region when you create a Convex project."
        disabled={isSaving}
        error={error}
        id="organization-default-convex-production-region"
        isLoading={isLoading || isFetching}
        label="Default production region for new Convex projects"
        onReload={onReload}
        onValueChange={onValueChange}
        regions={regions}
        selectionUnavailable={selectionUnavailable}
        value={value}
      />
      <ConvexDeploymentRegionSaveError message={saveError} />
      <Button
        className="justify-self-start"
        disabled={!changed || isSaving}
        onClick={onSave}
        size="sm"
        type="button"
      >
        {isSaving ? "Saving..." : "Save default"}
      </Button>
    </div>
  );
}

function OrganizationConvexDeploymentRegionSetting({
  organization,
}: {
  organization: ViewerOrganization;
}) {
  const setDefaultConvexDeploymentRegion = useAction(api.convexDeploymentRegions.setDefault);
  const defaultConvexDeploymentRegion = useConvexQuery(api.convexDeploymentRegions.getDefault, {
    organizationId: organization.organizationId,
  });
  const convexConnection = useConvexQuery(api.users.getConvexConnectionStatus, {
    organizationId: organization.organizationId,
  });
  const convexDeploymentRegionsQuery = useConvexDeploymentRegions({
    enabled: organization.role === "owner" && convexConnection?.state === "connected",
    organizationId: organization.organizationId,
  });
  const [draft, setDraft] = useState<{
    organizationId: Id<"organizations">;
    region: ConvexDeploymentRegion | null;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const draftRegion =
    draft?.organizationId === organization.organizationId ? draft.region : undefined;
  const selectedRegion =
    draftRegion === undefined ? (defaultConvexDeploymentRegion ?? null) : draftRegion;
  const changed = draftRegion !== undefined && draftRegion !== defaultConvexDeploymentRegion;
  const selectionUnavailable = Boolean(
    selectedRegion &&
    convexDeploymentRegionsQuery.data &&
    !convexDeploymentRegionsQuery.data.regions.some(
      (region) => region.name === selectedRegion && region.available,
    ),
  );

  const writeDefault = async (deploymentRegion: ConvexDeploymentRegion | null) => {
    if (isSaving || organization.role !== "owner") {
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      await setDefaultConvexDeploymentRegion({
        organizationId: organization.organizationId,
        deploymentRegion,
      });
      setDraft(null);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not save the default production region.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  let content: ReactNode;
  if (organization.role !== "owner") {
    content = <ConvexDeploymentRegionValue value={defaultConvexDeploymentRegion} />;
  } else if (convexConnection === undefined || defaultConvexDeploymentRegion === undefined) {
    content = (
      <div className="text-sm text-muted-foreground" role="status">
        Loading...
      </div>
    );
  } else if (convexConnection.state !== "connected") {
    content = (
      <DisconnectedConvexDeploymentRegionSetting
        defaultRegion={defaultConvexDeploymentRegion}
        githubOwnerLogin={organization.githubOwnerLogin}
        isSaving={isSaving}
        onClear={() => {
          void writeDefault(null);
        }}
        saveError={saveError}
      />
    );
  } else {
    content = (
      <ConnectedConvexDeploymentRegionSetting
        changed={changed}
        error={Boolean(convexDeploymentRegionsQuery.error)}
        isFetching={convexDeploymentRegionsQuery.isFetching}
        isLoading={convexDeploymentRegionsQuery.isPending}
        isSaving={isSaving}
        onReload={() => {
          void convexDeploymentRegionsQuery.refetch();
        }}
        onSave={() => {
          void writeDefault(selectedRegion);
        }}
        onValueChange={(region) => {
          setSaveError(null);
          setDraft({ organizationId: organization.organizationId, region });
        }}
        regions={convexDeploymentRegionsQuery.data?.regions ?? []}
        saveError={saveError}
        selectionUnavailable={selectionUnavailable}
        value={selectedRegion}
      />
    );
  }

  return (
    <section className="mt-8 border-t pt-6" aria-labelledby="organization-deployment-heading">
      <h2 id="organization-deployment-heading" className="text-base font-semibold">
        Deployment
      </h2>
      <div className="mt-4">{content}</div>
    </section>
  );
}

export function OrganizationSettingsPage({
  organization,
  search,
}: {
  organization: ViewerOrganization;
  search: OrganizationBillingSearch;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const updateOrganizationGitHubOwnerLogin = useAction(
    api.github.updateOrganizationGitHubOwnerLogin,
  );
  const githubIdentities = useOrganizationGitHubIdentities([organization.organizationId]);
  const githubIdentity = githubIdentities.get(organization.organizationId)?.owner;
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [updatingGitHubOwnerLogin, setUpdatingGitHubOwnerLogin] = useState(false);

  const updateGitHubOwnerLogin = async () => {
    if (
      updatingGitHubOwnerLogin ||
      organization.role !== "owner" ||
      githubIdentity?.status !== "renamed"
    ) {
      return;
    }
    setUpdatingGitHubOwnerLogin(true);
    try {
      const result = await updateOrganizationGitHubOwnerLogin({
        organizationId: organization.organizationId,
        expectedGithubOwnerLogin: githubIdentity.githubOwnerLogin,
      });
      await navigate({
        hash: true,
        replace: true,
        search: true,
        to: buildOrganizationRoutePath({
          owner: result.githubOwnerLogin,
          section: "settings",
        }),
      });
      void queryClient.invalidateQueries({
        queryKey: organizationGitHubIdentityQueryKey(organization.organizationId),
      });
    } catch (error) {
      toast({
        title: "Could not update organization name",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUpdatingGitHubOwnerLogin(false);
    }
  };

  return (
    <main
      data-testid="organization-settings-page"
      className="container mx-auto w-full max-w-2xl py-6"
    >
      <h1 className="text-xl font-semibold @2xl:text-2xl">Organization settings</h1>
      <section className="mt-8 border-t pt-6" aria-labelledby="organization-identity-heading">
        <h2 id="organization-identity-heading" className="text-base font-semibold">
          Identity
        </h2>
        <dl className="mt-4 space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm font-medium">GitHub owner</dt>
            <dd className="text-sm text-muted-foreground">{organization.githubOwnerLogin}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm font-medium">Samebase role</dt>
            <dd className="text-sm text-muted-foreground">
              {organization.role === "owner" ? "Owner" : "Member"}
            </dd>
          </div>
        </dl>
        <OrganizationIdentityNotice
          identity={githubIdentity}
          organizationRole={organization.role}
          updatePending={updatingGitHubOwnerLogin}
          onUpdateName={() => {
            void updateGitHubOwnerLogin();
          }}
        />
      </section>
      <OrganizationConvexDeploymentRegionSetting organization={organization} />
      <OrganizationBillingSection organization={organization} search={search} />
      {organization.role === "owner" ? (
        <section className="mt-8 border-t pt-6" aria-label="Delete organization">
          <Button
            type="button"
            variant="destructive"
            disabled={isDeleteDialogOpen}
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            Delete organization
          </Button>
        </section>
      ) : null}
      {isDeleteDialogOpen ? (
        <OrganizationDeletionDialog
          organization={organization}
          onClose={() => setIsDeleteDialogOpen(false)}
        />
      ) : null}
    </main>
  );
}
