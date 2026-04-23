import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { CodespaceChatOnlyView } from "@/components/CodespaceChatOnlyView";
import { CHAT_ENABLED } from "@/lib/featureFlags";
import { buildVaultFileRoute } from "@/lib/vaultRoutes";

function DisabledCodespaceChatRedirect() {
  const navigate = Route.useNavigate();
  const { owner, repo, branch } = Route.useParams();

  useEffect(() => {
    void navigate({
      href: buildVaultFileRoute({
        owner,
        repoName: repo,
        branch,
      }),
      replace: true,
      state: true,
    });
  }, [branch, navigate, owner, repo]);

  return null;
}

function CodespaceChatRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      {CHAT_ENABLED ? (
        <CodespaceChatOnlyView />
      ) : (
        <DisabledCodespaceChatRedirect />
      )}
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute(
  "/vault/$owner/$repo/codespace/$branch/chat",
)({
  component: CodespaceChatRouteComponent,
});
