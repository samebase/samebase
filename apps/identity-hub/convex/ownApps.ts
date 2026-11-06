import { env } from "./_generated/server";

/**
 * Whether the apps of a repository are this hub's own, by GitHub's numeric repository id, which a
 * rename or a transfer does not change: an id of `OWN_REPOSITORY_IDS`. Own apps are first-party:
 * every connector but a reserved one, the connector's own account id, and provider logins, and the
 * pause does not stop them. Every other repository's apps are third-party, with the one connector
 * `APPS_CONNECTOR`. A repository added later gets first-party apps only under app names it has not
 * used: an existing app keeps the kind it was created as.
 */
export function isOwnRepository(githubRepositoryDatabaseId: string) {
  return (env.OWN_REPOSITORY_IDS ?? "")
    .split(",")
    .some((id) => id.trim() === githubRepositoryDatabaseId);
}
