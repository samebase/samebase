import { EmailMonitor } from "@samebase/convex-cloudflare-email-inbox-ui";
import "@samebase/convex-cloudflare-email-inbox-ui/styles.css";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { api } from "../../convex/_generated/api";

function AdminEmailsRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <main
        data-testid="admin-emails-page"
        data-posthog-mask
        className="container mx-auto w-full max-w-6xl py-6"
      >
        <h1 className="mb-6 text-xl font-semibold @2xl:text-2xl">Emails</h1>
        <EmailMonitor api={api.emailMonitor} />
      </main>
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/admin/emails")({
  staticData: ROUTE_ACCESS_METADATA_BY_PATH["/admin/emails"],
  component: AdminEmailsRouteComponent,
});
