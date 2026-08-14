type GitHubOrganizationOwner = {
  githubOwnerType: "organization" | "user";
};

export function personalOrganizationsFirst<Organization extends GitHubOrganizationOwner>(
  organizations: readonly Organization[],
): Organization[] {
  return [
    ...organizations.filter((organization) => organization.githubOwnerType === "user"),
    ...organizations.filter((organization) => organization.githubOwnerType === "organization"),
  ];
}
