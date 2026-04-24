import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPolicyPage } from "@/components/PrivacyPolicyPage";
import { RoutedPage } from "./-publicRouteComponents";

function PrivacyRouteComponent() {
  return (
    <RoutedPage pathname="/privacy">
      <PrivacyPolicyPage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/_public/privacy")({
  component: PrivacyRouteComponent,
});
