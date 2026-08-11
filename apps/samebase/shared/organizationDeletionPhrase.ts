export function buildOrganizationDeletionConfirmationPhrase(githubOwnerLogin: string): string {
  return `delete ${githubOwnerLogin}`;
}
