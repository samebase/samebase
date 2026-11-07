/**
 * The fields that every client row holds besides its credentials, for a test that writes a client
 * row itself. The claims are those of GitHub's documented example token; the enrollment is the
 * fake connector of the harness.
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
  connectors: ["fake"],
};
