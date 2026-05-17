import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPolicyPage } from "#src/components/PrivacyPolicyPage.tsx";
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
