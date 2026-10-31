import { CloudflareBuildTokenField } from "@/repository/setup/CloudflareBuildTokenField";
import { NewAppCreateFormFields, NewAppProviderReadiness } from "@/repository/setup/NewAppPage";
import { Button } from "@/components/ui/button";
import { ConvexDeploymentRegionField } from "@/repository/setup/ConvexDeploymentRegionField";

export type NewAppPageVisualMode = "new-app-build-token" | "new-app-provider-blocked";

export function NewAppPageVisualFixture({ mode }: { mode: NewAppPageVisualMode }) {
  if (mode === "new-app-build-token") {
    return (
      <div data-testid="new-app-build-token" className="container flex max-w-xl flex-col py-6">
        <form className="flex w-full max-w-md flex-col gap-4">
          <h1 className="text-2xl font-semibold">New App</h1>
          <div className="flex w-full flex-col items-stretch gap-2">
            <NewAppCreateFormFields
              cloudflareBuildTokenField={
                <CloudflareBuildTokenField
                  disabled={false}
                  emptyState="deferred"
                  error={false}
                  id="visual-cloudflare-build-token"
                  isLoading={false}
                  lastUsedUuid="build-token-2026-08-14"
                  onReload={() => {}}
                  onValueChange={() => {}}
                  selectionUnavailable={false}
                  tokens={[
                    {
                      name: "Workers Builds - 2026-08-14 01:54",
                      uuid: "build-token-2026-08-14",
                    },
                    { name: "samebase build token", uuid: "samebase-build-token" },
                  ]}
                  value="build-token-2026-08-14"
                />
              }
              cloudflareWorkerName="acme-notes"
              cloudflareWorkerNameSupport={null}
              convexProjectName="acme-notes"
              convexProjectNameSupport={null}
              convexDeploymentRegionField={
                <ConvexDeploymentRegionField
                  disabled={false}
                  id="visual-convex-production-region"
                  onValueChange={() => {}}
                  showEuPricing
                  value="aws-eu-west-1"
                />
              }
              githubRepositoryNameSupport={null}
              hasRequiredCreateConnections
              isCreating={false}
              newRepositoryName="acme-notes"
              onCloudflareWorkerNameBlur={() => {}}
              onCloudflareWorkerNameChange={() => {}}
              onConvexProjectNameBlur={() => {}}
              onConvexProjectNameChange={() => {}}
              onNewRepositoryNameChange={() => {}}
              showCloudflareWorkerName
              showConvexProjectName
            />
          </div>
          <Button className="self-start">New App</Button>
        </form>
      </div>
    );
  }

  return (
    <div data-testid="new-app-provider-blocked" className="container flex max-w-xl flex-col py-6">
      <h1 className="mb-6 text-2xl font-semibold">New App</h1>
      <div className="grid gap-6">
        <NewAppProviderReadiness
          canManageOrganization={false}
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
          provisioning="samebase"
        />
        <Button disabled>New App</Button>
      </div>
    </div>
  );
}
