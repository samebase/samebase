import { OrganizationInvitationPage } from "@/organization/OrganizationInvitationPage";
import { TermsAcceptanceGate } from "@/appShell/TermsAcceptanceGate";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/invite/$code")({
  component: OrganizationInvitationRoutePage,
  staticData: ROUTE_ACCESS_METADATA_BY_PATH["/invite/$code"],
});

function OrganizationInvitationRoutePage() {
  const { code } = Route.useParams();
  return (
    <TermsAcceptanceGate>
      <OrganizationInvitationPage code={code} />
    </TermsAcceptanceGate>
  );
}
