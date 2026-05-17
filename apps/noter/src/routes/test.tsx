import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "#src/components/AuthenticatedAppRoutePage.tsx";

function RootTestRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <div data-testid="root-test-route">Test</div>
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/test")({
  component: RootTestRouteComponent,
});
