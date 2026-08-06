import type { ViewerOrganization } from "@/lib/organizationContext";
import { OrganizationBillingSection } from "@/components/OrganizationBillingSection";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { getCurrentRootRelativeUrl, openGitHubAppSetupPopup } from "@/lib/githubAppSetupFlow";
import type { OrganizationBillingSearch } from "@/routeSearch/organizationBilling";
import { useAction, useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

type InstallationCheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "connected" }
  | { kind: "unavailable" };

export function OrganizationSettingsPage({
  organization,
  search,
}: {
  organization: ViewerOrganization;
  search: OrganizationBillingSearch;
}) {
  const checkViewerInstallation = useAction(api.githubAppAccess.checkViewerInstallation);
  const getGitHubAppInstallationUrl = useMutation(
    api.githubAppInstallation.getGitHubAppInstallationUrl,
  );
  const [checkState, setCheckState] = useState<InstallationCheckState>({ kind: "idle" });
  const [isReconnecting, setIsReconnecting] = useState(false);

  const checkInstallation = async () => {
    if (checkState.kind === "checking") {
      return;
    }
    setCheckState({ kind: "checking" });
    try {
      const result = await checkViewerInstallation({
        organizationId: organization.organizationId,
      });
      setCheckState({ kind: result.status });
    } catch (error) {
      setCheckState({ kind: "idle" });
      toast({
        description: error instanceof Error ? error.message : "Could not check GitHub App access.",
        title: "Access check failed",
        variant: "destructive",
      });
    }
  };

  const reconnectInstallation = () => {
    if (isReconnecting) {
      return;
    }
    setIsReconnecting(true);
    void openGitHubAppSetupPopup(async () => {
      return await getGitHubAppInstallationUrl({ returnToPath: getCurrentRootRelativeUrl() });
    })
      .catch((error: unknown) => {
        toast({
          description: error instanceof Error ? error.message : "Could not open GitHub App setup.",
          title: "Could not reconnect GitHub App",
          variant: "destructive",
        });
      })
      .finally(() => {
        setIsReconnecting(false);
      });
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
      </section>
      <section className="mt-8 border-t pt-6" aria-labelledby="organization-github-app-heading">
        <h2 id="organization-github-app-heading" className="text-base font-semibold">
          GitHub App
        </h2>
        {checkState.kind === "connected" || checkState.kind === "unavailable" ? (
          <p className="mt-4 text-sm text-muted-foreground" role="status">
            {checkState.kind === "connected" ? "Connected" : "Access unavailable"}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            disabled={checkState.kind === "checking" || isReconnecting}
            onClick={() => void checkInstallation()}
            type="button"
            variant="outline"
          >
            {checkState.kind === "checking" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {checkState.kind === "checking" ? "Checking..." : "Check access"}
          </Button>
          {organization.role === "owner" ? (
            <Button
              disabled={checkState.kind === "checking" || isReconnecting}
              onClick={reconnectInstallation}
              type="button"
            >
              {isReconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isReconnecting ? "Opening..." : "Reconnect GitHub App"}
            </Button>
          ) : null}
        </div>
      </section>
      <OrganizationBillingSection organization={organization} search={search} />
    </main>
  );
}
