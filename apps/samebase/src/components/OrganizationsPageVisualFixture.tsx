import {
  OrganizationsPageView,
  type OrganizationConnectionOption,
  type OrganizationsPageOrganization,
} from "./OrganizationsPage";

const organizations = [
  {
    githubOwnerId: "visual-open-owner",
    githubOwnerType: "organization",
    githubOwnerLogin: "samebase",
  },
] satisfies OrganizationsPageOrganization[];

const options = [
  {
    status: "connect",
    installationId: "visual-connect",
    githubOwnerType: "organization",
    githubOwnerLogin: "new-product-team",
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
] satisfies OrganizationConnectionOption[];

export function OrganizationsPageVisualFixture() {
  return (
    <OrganizationsPageView
      error={null}
      isAuthorizing={false}
      isInstalling={false}
      onAuthorize={() => {}}
      onConnect={() => {}}
      onInstall={() => {}}
      onRetry={() => {}}
      pendingInstallationId={null}
      state={{
        status: "ready",
        organizations,
        discovery: { status: "ready", options },
      }}
    />
  );
}
