import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { CodespaceChatOnlyView } from "@/components/CodespaceChatOnlyView";

function CodespaceChatRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <CodespaceChatOnlyView />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute(
  "/vault/$owner/$repo/codespace/$branch/chat",
)({
  component: CodespaceChatRouteComponent,
});
