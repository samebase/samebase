import { ProvidersPageView, type ProvidersPageRow } from "@/components/ProvidersPage";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  GitHubProviderLogo,
} from "@/components/vault-dashboard/VaultDashboardLogos";

export type ProvidersPageVisualMode = "providers-page";

function ignoreProviderVisualAction() {}

const PROVIDERS_PAGE_VISUAL_ROWS = [
  {
    actions: [
      {
        key: "oauth",
        label: "GitHub OAuth",
        onClick: ignoreProviderVisualAction,
      },
      {
        key: "api-key",
        label: "Use API key",
        onClick: ignoreProviderVisualAction,
      },
    ],
    icon: <GitHubProviderLogo />,
    key: "github",
    label: "GitHub",
    status: "Not connected",
  },
  {
    actions: [
      {
        key: "disconnect",
        label: "Disconnect",
        onClick: ignoreProviderVisualAction,
      },
    ],
    icon: <ConvexProviderLogo />,
    key: "convex",
    label: "Convex",
    status: "Connected to noter-md (OAuth)",
  },
  {
    actions: [
      {
        key: "select-account",
        label: "Manage account",
        onClick: ignoreProviderVisualAction,
      },
      {
        key: "check-token",
        label: "Check token",
        onClick: ignoreProviderVisualAction,
      },
      {
        key: "disconnect",
        label: "Disconnect",
        onClick: ignoreProviderVisualAction,
      },
    ],
    icon: <CloudflareProviderLogo />,
    key: "cloudflare",
    label: "Cloudflare",
    status:
      "Connected (OAuth). Account Noter Preview. Token Valid. Expires in 2 hours. Auto-refresh in 1 hour.",
  },
] satisfies readonly ProvidersPageRow[];

export function ProvidersPageVisualFixture() {
  return (
    <div data-testid="providers-page-visual-fixture" className="contents">
      <ProvidersPageView
        apiKeyDialog={null}
        cloudflareAccountDialog={null}
        providerError={null}
        providerRows={PROVIDERS_PAGE_VISUAL_ROWS}
      />
    </div>
  );
}
