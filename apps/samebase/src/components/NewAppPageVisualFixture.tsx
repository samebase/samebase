import { CloudflareBuildTokenField } from "@/components/CloudflareBuildTokenField";
import { NewAppCreateFormFields, NewAppProviderReadiness } from "@/components/NewAppPage";
import { Button } from "@/components/ui/button";

export type NewAppPageVisualMode =
  | "new-app-build-token"
  | "new-app-no-build-token"
  | "new-app-provider-blocked";

export function NewAppPageVisualFixture({ mode }: { mode: NewAppPageVisualMode }) {
  if (mode === "new-app-build-token" || mode === "new-app-no-build-token") {
    const hasBuildToken = mode === "new-app-build-token";

    return (
      <div data-testid={mode} className="container flex max-w-xl flex-col py-6">
        <form className="flex w-full max-w-md flex-col gap-4">
          <h1 className="text-2xl font-semibold">New App</h1>
          <div className="flex w-full flex-col items-stretch gap-2">
            <NewAppCreateFormFields
              cloudflareBuildTokenField={
                <CloudflareBuildTokenField
                  accountId="account_acme_production"
                  disabled={false}
                  emptyState="deferred"
                  error={false}
                  id="visual-cloudflare-build-token"
                  isLoading={false}
                  lastUsedUuid={hasBuildToken ? "build-token-2026-08-14" : null}
                  onReload={() => {}}
                  onValueChange={() => {}}
                  selectionUnavailable={false}
                  tokens={
                    hasBuildToken
                      ? [
                          {
                            name: "Workers Builds - 2026-08-14 01:54",
                            uuid: "build-token-2026-08-14",
                          },
                          { name: "samebase build token", uuid: "samebase-build-token" },
                        ]
                      : []
                  }
                  value={hasBuildToken ? "build-token-2026-08-14" : ""}
                />
              }
              cloudflareWorkerName="acme-notes"
              cloudflareWorkerNameSupport={null}
              convexProjectName="acme-notes"
              convexProjectNameSupport={null}
              githubRepositoryNameSupport={null}
              hasRequiredCreateConnections
              isCreating={false}
              newRepositoryName="acme-notes"
              onCloudflareWorkerNameBlur={() => {}}
              onCloudflareWorkerNameChange={() => {}}
              onConvexProjectNameBlur={() => {}}
              onConvexProjectNameChange={() => {}}
              onNewRepositoryNameChange={() => {}}
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
        />
        <Button disabled>New App</Button>
      </div>
    </div>
  );
}
