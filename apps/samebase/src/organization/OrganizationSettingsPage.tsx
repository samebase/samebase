import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery as useConvexQuery } from "convex/react";

import type { ViewerOrganization } from "@/organization/context";
import { OrganizationBillingSection } from "@/organization/OrganizationBillingSection";
import { OrganizationDeletionDialog } from "@/organization/OrganizationDeletionDialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import {
  organizationGitHubIdentityQueryKey,
  type OrganizationGitHubIdentityObservation,
  useOrganizationGitHubIdentities,
} from "@/organization/useOrganizationGitHubIdentity";
import { buildOrganizationRoutePath } from "@/organization/organizationRoutes";
import type { OrganizationBillingSearch } from "@/routeSearch/organizationBilling";
import { api } from "../../convex/_generated/api";
import { ConvexDeploymentRegionField } from "@/components/ConvexDeploymentRegionField";
import {
  formatConvexDeploymentRegionLabel,
  resolveDefaultConvexDeploymentRegion,
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

function OrganizationConvexDeploymentRegionSetting({
  organization,
}: {
  organization: ViewerOrganization;
}) {
  const setDefaultConvexDeploymentRegion = useMutation(api.convexDeploymentRegions.setDefault);
  const defaultConvexDeploymentRegion = useConvexQuery(api.convexDeploymentRegions.getDefault, {
    organizationId: organization.organizationId,
  });
  const [draftRegion, setDraftRegion] = useState<ConvexDeploymentRegion | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const selectedRegion =
    draftRegion ?? resolveDefaultConvexDeploymentRegion(defaultConvexDeploymentRegion);
  const changed = draftRegion !== null && draftRegion !== defaultConvexDeploymentRegion;

  const writeDefault = async (deploymentRegion: ConvexDeploymentRegion) => {
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      await setDefaultConvexDeploymentRegion({
        organizationId: organization.organizationId,
        deploymentRegion,
      });
      setDraftRegion(null);
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
    content = (
      <dl className="space-y-1">
        <dt className="text-sm font-medium">Default production region</dt>
        <dd className="text-sm text-muted-foreground">
          {defaultConvexDeploymentRegion === undefined
            ? "Loading..."
            : formatConvexDeploymentRegionLabel(defaultConvexDeploymentRegion)}
        </dd>
      </dl>
    );
  } else if (defaultConvexDeploymentRegion === undefined) {
    content = (
      <div className="text-sm text-muted-foreground" role="status">
        Loading...
      </div>
    );
  } else {
    content = (
      <div className="grid gap-3">
        <ConvexDeploymentRegionField
          disabled={isSaving}
          id="organization-default-convex-production-region"
          label="Default production region"
          onValueChange={(region) => {
            setSaveError(null);
            setDraftRegion(region);
          }}
          showEuPricing={false}
          value={selectedRegion}
        />
        {saveError ? (
          <div className="text-sm text-red-600" role="alert">
            {saveError}
          </div>
        ) : null}
        <Button
          className="justify-self-start"
          disabled={!changed || isSaving}
          onClick={() => {
            void writeDefault(selectedRegion);
          }}
          size="sm"
          type="button"
        >
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>
    );
  }

  return (
    <section className="mt-8 border-t pt-6" aria-labelledby="organization-deployment-heading">
      <h2 id="organization-deployment-heading" className="text-base font-semibold">
        Convex
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
      <OrganizationConvexDeploymentRegionSetting
        key={organization.organizationId}
        organization={organization}
      />
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
