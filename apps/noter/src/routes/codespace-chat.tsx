import { createFileRoute } from "@tanstack/react-router";
import { CodespaceChatRoutePage } from "@/components/CodespaceChatRoutePage";

export const Route = createFileRoute(
  "/vault/$owner/$repo/codespace/$branch/chat",
)({
  component: CodespaceChatRoutePage,
});
