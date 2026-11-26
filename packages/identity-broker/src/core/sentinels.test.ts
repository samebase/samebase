// Sentinel credentials (design section 12): a client secret, a code, a verifier, a cookie and a
// provider token that carry one marker never appear in a log line or in a response, for malformed
// input, provider errors and command failures.
import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  createBroker,
  fakeUpstream,
  brokerLogLine,
  pkce,
  stubFetch,
  txnCookie,
  type Broker,
} from "./testing/harness.ts";

const MARK = "SENTINEL7f3a";
const REDIRECT_URI = "https://app.test/oauth/broker/callback";
/** A value of the PKCE alphabet and length that carries the marker. */
const VERIFIER = `${MARK}-verifier-${"v".repeat(40)}`;

afterEach(() => {
  vi.restoreAllMocks();
});

/** Every console line, as text. */
function captureLogs() {
  const lines: string[] = [];
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(
        args.map((arg) => (arg instanceof Error ? `${arg.stack}` : String(arg))).join(" "),
      );
    });
  }
  return lines;
}

/** The status, every header and the body of a response, as text. */
async function seen(response: Response) {
  return `${response.status} ${JSON.stringify([...response.headers])} ${await response.text()}`;
}

async function setup() {
  const fetch = stubFetch();
  const { connector } = fakeUpstream(fetch);
  const h = await createBroker({ fetch, config: { connectors: [connector] } });
  const client = await h.registerClient({ appName: "My app", redirectUri: REDIRECT_URI });
  return { h, client };
}

/** `/authorize` straight to the fake provider, and the callback URL the provider would call. */
async function started(h: Broker, clientId: string) {
  const { challenge } = await pkce();
  const url = new URL(`${h.issuer}/authorize`);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid",
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  const response = await h.fetchBroker(url);
  const upstream = new URL(response.headers.get("location") ?? "");
  const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
  return { response, callback };
}

const token = (h: Broker, form: Record<string, string>, headers: Record<string, string> = {}) =>
  h.fetchBroker(`${h.issuer}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(form).toString(),
  });

test("malformed input, provider errors and command failures never echo a credential", async () => {
  const logs = captureLogs();
  const { h, client } = await setup();
  const outputs: string[] = [];

  // Malformed token requests: two methods, bad Basic, a short verifier, a wrong secret.
  const form = {
    grant_type: "authorization_code",
    code: `${MARK}-code`,
    code_verifier: VERIFIER,
    redirect_uri: REDIRECT_URI,
    client_id: client.clientId,
    client_secret: `${MARK}-secret`,
  };
  outputs.push(
    await seen(await token(h, form, { Authorization: `Basic ${btoa(`a:${MARK}`)}` })),
    await seen(await token(h, {}, { Authorization: `Basic ${MARK}%%%` })),
    await seen(await token(h, { ...form, code_verifier: MARK })),
    await seen(await token(h, form)),
    await seen(
      await h.fetchBroker(`${h.issuer}/userinfo`, { headers: { Authorization: `Bearer ${MARK}` } }),
    ),
  );

  // A forged cookie at the callback.
  const forged = await started(h, client.clientId);
  forged.callback.searchParams.set("code", `${MARK}-upstream-code`);
  outputs.push(
    await seen(
      await h.fetchBroker(forged.callback, {
        headers: { Cookie: `__Host-broker_txn_x=${MARK}-cookie` },
      }),
    ),
  );

  // The provider refuses the code and writes the marker in its answer.
  h.fetch.plan({
    match: (request) => request.url === "https://upstream.test/token",
    respond: () =>
      Response.json(
        { error: "invalid_grant", error_description: `${MARK} detail`, access_token: MARK },
        { status: 400 },
      ),
  });
  const refused = await started(h, client.clientId);
  refused.callback.searchParams.set("code", `${MARK}-upstream-code`);
  outputs.push(
    await seen(await h.fetchBroker(refused.callback, { headers: txnCookie(refused.response) })),
  );

  // The provider gives a token whose user lookup fails with the marker in the body.
  h.fetch.plan({
    match: (request) => request.url === "https://upstream.test/token",
    respond: () => Response.json({ access_token: `${MARK}-provider-token`, token_type: "bearer" }),
  });
  h.fetch.plan({
    match: (request) => request.url === "https://api.upstream.test/user",
    respond: () => new Response(`${MARK} upstream failure`, { status: 500 }),
  });
  const failing = await started(h, client.clientId);
  failing.callback.searchParams.set("code", `${MARK}-upstream-code`);
  outputs.push(
    await seen(await h.fetchBroker(failing.callback, { headers: txnCookie(failing.response) })),
  );

  // Commands that fail, as a lost RPC reply does: at the claim, at the completion, at redemption.
  for (const failingCommand of [
    "authRequests.claimUpstream",
    "authRequests.complete",
    "authRequests.exchangeCode",
  ] as const) {
    const flow = await started(h, client.clientId);
    flow.callback.searchParams.set("code", `${MARK}-upstream-code`);
    h.failCommands((name) => name === failingCommand);
    outputs.push(
      await seen(await h.fetchBroker(flow.callback, { headers: txnCookie(flow.response) })),
      await seen(await token(h, form)),
    );
    h.failCommands(null);
  }

  expect(outputs.length).toBeGreaterThan(10);
  for (const output of outputs) {
    expect(output).not.toContain(MARK);
  }
  expect(logs.length).toBeGreaterThan(0);
  for (const line of logs) {
    expect(line).not.toContain(MARK);
  }
  // A failed command answers 500 with no detail and logs the allow-listed record alone.
  const brokerErrors = logs.filter((line) => line.includes('"broker_error"')).map(brokerLogLine);
  expect(brokerErrors).toContainEqual({
    message: "broker_error",
    level: "ERROR",
    annotations: {
      route: "/connectors/fake/callback",
      command: "authRequests.claimUpstream",
      category: "command_failed",
    },
    spans: {},
  });
  expect(brokerErrors).toContainEqual({
    message: "broker_error",
    level: "ERROR",
    annotations: {
      route: "/token",
      command: "authRequests.exchangeCode",
      category: "command_failed",
    },
    spans: {},
  });
  expect(outputs).toContainEqual(expect.stringMatching(/^500 .*\{"error":"server_error"\}$/));
});
