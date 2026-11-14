// RFC 6749 sections 3.1 and 3.2: "Parameters sent without a value MUST be treated as if they were
// omitted from the request." That sentence is the property.
// Before bc8a2a9 (broker 0.9.0, 2026-10-30), max_age= became 0, which the Google and GitHub
// connectors answer with login_required, and state= / nonce= came through as "".
import fc from "fast-check";
import { run } from "./run.ts";

const versions = {
  "before bc8a2a9": [
    await import("./old/broker-protocol-before-bc8a2a9.ts"),
    await import("./old/broker-responses-before-bc8a2a9.ts"),
  ],
  main: [
    await import("./old/broker-protocol-main.ts"),
    await import("./old/broker-responses-main.ts"),
  ],
} as const;

const urlSafe = fc.stringMatching(/^[A-Za-z0-9\-._~]{43,64}$/);
const optional = <T>(a: fc.Arbitrary<T>) => fc.option(a, { nil: undefined });
const authorizeRequest = fc.record({
  client_id: fc.constant("app"),
  redirect_uri: fc.constant("https://app.example/callback"),
  response_type: fc.constant("code"),
  scope: fc.constantFrom("openid", "openid email", "openid profile email"),
  code_challenge: urlSafe,
  code_challenge_method: fc.constant("S256"),
  state: optional(fc.stringMatching(/^[A-Za-z0-9]{1,16}$/)),
  nonce: optional(fc.stringMatching(/^[A-Za-z0-9]{1,16}$/)),
  prompt: optional(fc.constantFrom("none", "login")),
  max_age: optional(fc.integer({ min: 0, max: 86400 }).map(String)),
  connector: optional(fc.constantFrom("google", "github")),
});
const authorizeOptional = ["state", "nonce", "prompt", "max_age", "connector"] as const;

const tokenRequest = fc.record({
  grant_type: fc.constant("authorization_code"),
  code: fc.stringMatching(/^[A-Za-z0-9]{8,24}$/),
  code_verifier: urlSafe,
  redirect_uri: optional(fc.constant("https://app.example/callback")),
});
const tokenOptional = ["redirect_uri"] as const;

const query = (p: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(p).flatMap(([k, v]) => (v === undefined ? [] : [[k, v]])));
const withEmpty = (p: Record<string, string | undefined>, k: string) => ({ ...p, [k]: "" });
const without = (p: Record<string, string | undefined>, k: string) => ({ ...p, [k]: undefined });

for (const [label, [protocol, responses]] of Object.entries(versions)) {
  // The /authorize handler: readParameters, then validateAuthorizeTarget and validateAuthorizeRest.
  const authorize = async (p: Record<string, string | undefined>) => {
    const params = await responses.readParameters(
      new Request(`https://broker.example/authorize?${query(p)}`),
    );
    const target = protocol.validateAuthorizeTarget(params);
    return target.ok ? protocol.validateAuthorizeRest(params, target.value) : target;
  };
  await run(
    `[${label}] /authorize: an empty parameter counts as omitted`,
    fc.asyncProperty(
      authorizeRequest,
      fc.constantFrom(...authorizeOptional),
      async (p, k) =>
        JSON.stringify(await authorize(withEmpty(p, k))) ===
        JSON.stringify(await authorize(without(p, k))),
    ),
  );

  // The /token handler reads the form with new URLSearchParams(await request.text()), then validateTokenRequest.
  const client = { clientId: "app", clientSecret: "s", method: "client_secret_basic" } as const;
  const token = (p: Record<string, string | undefined>) =>
    protocol.validateTokenRequest(query(p), client);
  await run(
    `[${label}] /token: an empty parameter counts as omitted`,
    fc.property(
      tokenRequest,
      fc.constantFrom(...tokenOptional),
      (p, k) => JSON.stringify(token(withEmpty(p, k))) === JSON.stringify(token(without(p, k))),
    ),
  );
}
