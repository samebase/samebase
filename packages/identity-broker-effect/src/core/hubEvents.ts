/**
 * Writes one console line, `hub_event` and a JSON object, for a sign-in that ended with tokens and
 * a sign-in that a stop, the card or a limit refused. A log stream of the host's deployment, such
 * as PostHog Logs, carries the line out. The line names the client id, the card's `ref`, the
 * connector, and the reason of a refusal. It never names the user, a token, or a return address.
 */
export function logHubEvent(line: {
  event: "sign_in" | "sign_in_refused";
  clientId: string;
  ref: string;
  connector: string | null;
  reason: string | null;
}) {
  console.info(
    `hub_event ${JSON.stringify({
      event: line.event,
      clientId: line.clientId,
      ref: line.ref,
      connector: line.connector,
      reason: line.reason,
    })}`,
  );
}
