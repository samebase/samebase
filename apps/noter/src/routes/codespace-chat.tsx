import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { lazy } from "react";

const CodespaceChatOnlyView = lazy(async () => {
  const module = await import("@/components/CodespaceChatOnlyView");
  return { default: module.CodespaceChatOnlyView };
});

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
