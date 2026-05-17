import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthenticatedAppRoutePage } from "#src/components/AuthenticatedAppRoutePage.tsx";
import { CodespaceChatOnlyView } from "#src/components/CodespaceChatOnlyView.tsx";
import { CHAT_ENABLED, CODESPACES_ENABLED } from "../../shared/featureFlags";
import { buildVaultFileRoute } from "#src/lib/vaultRoutes.ts";

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
      {CHAT_ENABLED && CODESPACES_ENABLED ? (
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
