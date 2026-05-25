import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";

function RootTestRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <div data-testid="root-test-route">Test</div>
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/test")({
  ssr: false,
  staticData: { availableOn: ["local"], permission: "admin" },
  component: RootTestRouteComponent,
});
