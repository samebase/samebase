import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { VaultDashboardAccountSection } from "@/components/vault-dashboard/VaultDashboardChrome";

describe("VaultDashboardAccountSection", () => {
  it("keeps authenticated provider details away from 1Password SSO detection", () => {
    const markup = renderToStaticMarkup(
      <VaultDashboardAccountSection
        open={true}
        onOpenChange={() => {}}
        displayName="Nicu Chiciuc"
        email="nicu@example.com"
        providerLabel="Google"
        isSignOutPending={false}
        onSignOut={() => {}}
      />,
    );

    expect(markup).toContain('data-1p-ignore=""');
    expect(markup).toContain('data-op-ignore=""');
    expect(markup).toContain("Auth provider: Google");
    expect(markup).not.toContain("Signed in with Google");
  });
});
