import { NewAppProviderReadiness } from "@/components/NewAppPage";
import { Button } from "@/components/ui/button";

export type NewAppPageVisualMode = "new-app-provider-blocked";

export function NewAppPageVisualFixture() {
  return (
    <div data-testid="new-app-provider-blocked" className="container flex max-w-xl flex-col py-6">
      <h1 className="mb-6 text-2xl font-semibold">New App</h1>
      <div className="grid gap-6">
        <NewAppProviderReadiness
          canManageSelectedOrganization={false}
          convexConnection={{
            state: "connected",
            teamId: "team_acme_platform",
            teamSlug: "acme-platform",
            authMethod: "oauth",
          }}
          cloudflareConnection={{
            state: "disconnected",
            accountId: "account_acme_production",
            accountName: "acme-production",
          }}
        />
        <Button disabled>New App</Button>
      </div>
    </div>
  );
}
