import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPolicyPage } from "@/components/PrivacyPolicyPage";
import { RoutedPage } from "./-publicRouteComponents";

function PrivacyRouteComponent() {
  return (
    <RoutedPage pathname="/privacy" withLayout>
      <PrivacyPolicyPage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/privacy")({
  component: PrivacyRouteComponent,
});
