import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { CodespaceChatOnlyView } from "@/components/CodespaceChatOnlyView";
import { CHAT_ENABLED, CODESPACES_ENABLED } from "../../shared/featureFlags";
import { buildVaultFileRoute } from "@/lib/vaultRoutes";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";

function DisabledCodespaceChatRedirect() {
  const navigate = Route.useNavigate();
  const { owner, repo, branch } = Route.useParams();
  const search = Route.useSearch();

  useEffect(() => {
    void navigate({
      href: buildPathWithTanStackSearch({
        pathname: buildVaultFileRoute({
          owner,
          repoName: repo,
          branch,
        }),
        search,
      }),
      replace: true,
      state: true,
    });
  }, [branch, navigate, owner, repo, search]);

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

export const Route = createFileRoute("/vault/$owner/$repo/codespace/$branch/chat")({
  staticData: { permission: "admin" },
  component: CodespaceChatRouteComponent,
});
