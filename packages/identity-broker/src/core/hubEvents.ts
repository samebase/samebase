/**
 * Writes one console line, `hub_event` and a JSON object, for a sign-in that ended with tokens and
 * a sign-in that a stop, the card or a limit refused, and the same for a connection, a refresh and
 * a revocation. A log stream of the host's deployment (for one, PostHog Logs) carries the line
 * out. The line names the client id, the card's `ref` (null when the card is gone), the connector or
 * the connection's provider, and the reason of a refusal. It never names the user, a token, a
 * code, or a return address.
 */
export function logHubEvent(line: {
  event:
    | "sign_in"
    | "sign_in_refused"
    | "connection"
    | "connection_refused"
    | "refresh"
    | "refresh_refused"
    | "revoke";
  clientId: string;
  ref: string | null;
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
