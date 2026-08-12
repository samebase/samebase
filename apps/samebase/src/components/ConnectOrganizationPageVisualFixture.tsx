import {
  ConnectOrganizationPageView,
  type ConnectOrganizationOption,
} from "./ConnectOrganizationPage";

const options = [
  {
    status: "connect",
    installationId: "visual-connect",
    githubOwnerType: "organization",
    githubOwnerLogin: "new-product-team",
  },
  {
    status: "open",
    installationId: "visual-open",
    githubOwnerType: "organization",
    githubOwnerLogin: "samebase",
    organizationOwnerLogin: "samebase",
  },
  {
    status: "invite_required",
    installationId: "visual-invite",
    githubOwnerType: "organization",
    githubOwnerLogin: "shared-platform",
  },
  {
    status: "owner_required",
    installationId: "visual-owner",
    githubOwnerType: "organization",
    githubOwnerLogin: "engineering-tools",
  },
] satisfies ConnectOrganizationOption[];

export function ConnectOrganizationPageVisualFixture() {
  return (
    <ConnectOrganizationPageView
      error={null}
      isAuthorizing={false}
      isInstalling={false}
      loading={false}
      onAuthorize={() => {}}
      onConnect={() => {}}
      onInstall={() => {}}
      options={options}
      pendingInstallationId={null}
      session="visual-session"
    />
  );
}
