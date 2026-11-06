/**
 * The GitHub repositories whose apps are this hub's own, by GitHub's numeric repository id, which a
 * rename or a transfer does not change. Their apps are first-party: every connector but a reserved
 * one, the connector's own account id, and provider logins. Every other repository's apps are
 * third-party, with the one connector `APPS_CONNECTOR`. A copy of this hub lists its own
 * repositories. A repository added here gets first-party apps only under app names it has not used:
 * an existing app keeps the kind it was created as.
 */
export const OWN_REPOSITORY_IDS: ReadonlySet<string> = new Set([
  "1021726325", // samebase/samebase
  "851029727", // nicu-chiciuc/bristol_tsx
  "1343236238", // nicu-chiciuc/ailegis-same
  "1347540564", // samebase/scout
]);
