export const ORGANIZATION_INVITATION_ROUTE = "/invite/$code";

export function isOrganizationInvitationPath(pathname: string): boolean {
  return /^\/invite\/[^/]+(?:\/.*)?$/i.test(pathname);
}
