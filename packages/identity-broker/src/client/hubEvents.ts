import type { Registration } from "./policy.js";

/**
 * Writes one console line, `hub_event` and a JSON object, for a sign-in that ended with tokens, a
 * sign-in that the policy or a limit refused, and the answer to a registration. A log stream of the
 * host's deployment, such as PostHog Logs, carries the line out of Convex. The line names the
 * client's repository, app, and deployment type from its facts, the connector, and the reason of a
 * refusal. It never names the user, a token, or a return address.
 */
export function logHubEvent(line: {
  event: "sign_in" | "sign_in_refused" | "registration" | "registration_refused";
  facts: Registration | null;
  connector: string | null;
  reason: string | null;
}) {
  console.info(
    `hub_event ${JSON.stringify({
      event: line.event,
      repository: line.facts?.repository ?? null,
      app: line.facts?.app ?? null,
      deployment: line.facts?.deploymentType ?? null,
      connector: line.connector,
      reason: line.reason,
    })}`,
  );
}
