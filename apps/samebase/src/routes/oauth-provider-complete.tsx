import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ProviderOAuthCompletionPage } from "@/organization/providers/ProviderOAuthCompletionPage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { PROVIDER_OAUTH_COMPLETION_ROUTE } from "../../shared/providerOAuthReturn";

export const Route = createFileRoute("/oauth/provider-complete")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH[PROVIDER_OAUTH_COMPLETION_ROUTE],
  component: ProviderOAuthCompletionRoutePage,
});

function ProviderOAuthCompletionRoutePage() {
  return (
    <AuthenticatedAppRoutePage>
      <ProviderOAuthCompletionPage />
    </AuthenticatedAppRoutePage>
  );
}
