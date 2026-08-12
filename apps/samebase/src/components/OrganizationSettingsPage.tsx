import { useState } from "react";

import type { ViewerOrganization } from "@/lib/organizationContext";
import { OrganizationBillingSection } from "@/components/OrganizationBillingSection";
import { OrganizationDeletionDialog } from "@/components/OrganizationDeletionDialog";
import { Button } from "@/components/ui/button";
import type { OrganizationBillingSearch } from "@/routeSearch/organizationBilling";

export function OrganizationSettingsPage({
  organization,
  search,
}: {
  organization: ViewerOrganization;
  search: OrganizationBillingSearch;
}) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

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
      </section>
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
