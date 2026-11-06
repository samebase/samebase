/**
 * The two fields that every client row holds, for a test that writes a client row itself. The claims
 * are those of GitHub's documented example token.
 */
export const testClientRecord = {
  app: "my-app",
  registeredBy: {
    kind: "github" as const,
    githubRepository: "octo-org/octo-repo",
    githubOwnerId: "65",
    githubActorId: "12",
    githubActorLogin: "octocat",
    commitSha: "example-sha",
  },
};
