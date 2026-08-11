import type { ViewerOrganization } from "@/lib/organizationContext";
import { OrganizationBillingSection } from "@/components/OrganizationBillingSection";
import { OrganizationDeletionSection } from "@/components/OrganizationDeletionSection";
import type { OrganizationBillingSearch } from "@/routeSearch/organizationBilling";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function OrganizationSettingsPage({
  organization,
  search,
}: {
  organization: ViewerOrganization;
  search: OrganizationBillingSearch;
}) {
  const deletionSettings = useQuery(api.organizationDeletion.index.settings, {
    organizationId: organization.organizationId,
  });
  const deletionActive =
    deletionSettings?.deletion.state === "running" ||
    deletionSettings?.deletion.state === "needs_attention";

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
      {deletionSettings && !deletionActive ? (
        <OrganizationBillingSection organization={organization} search={search} />
      ) : null}
      {deletionSettings ? <OrganizationDeletionSection settings={deletionSettings} /> : null}
    </main>
  );
}
