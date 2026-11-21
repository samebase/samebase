// The test app's hub, at the deployment's own site URL, with one connector: the fake OpenID
// provider of the core's tests (`fakeOidcUpstream` in src/core/testing/harness.ts), whose issuer,
// client id and client secret these are. The test on a real backend (../backend.test.ts) serves
// that provider and sets the environment variables of the local deployment: the signing keys and
// `IDP_CLIENT_SECRET`. The allow-list names the test's repository with its owner.
import { Config, Effect, Layer, Redacted } from "effect";
import { convexHub } from "../../../src/hosts/convex/hub.ts";
import { github, HubConfig, SignInPage } from "../../../src/index.ts";
import { components } from "./_generated/api.js";
import { FAKE_IDP_ISSUER, FAKE_IDP_PORT } from "./fakeIdp.ts";

// The fake provider listens on plain HTTP on loopback, and the hub's requests to its https issuer
// go there: the local backend on macOS trusts only the system's certificates, and oauth4webapi
// sends no request to an issuer that is not https. Every other request is unchanged. The fake
// provider answers no redirect, and the Convex runtime's `Request` has no `redirect` getter, so
// the redirect mode is not carried over.
const systemFetch = fetch;
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  if (!request.url.startsWith(`${FAKE_IDP_ISSUER}/`)) {
    return await systemFetch(request);
  }
  return await systemFetch(
    `http://127.0.0.1:${FAKE_IDP_PORT}${request.url.slice(FAKE_IDP_ISSUER.length)}`,
    {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" ? null : await request.text(),
    },
  );
};

const settings = Layer.unwrap(
  Effect.gen(function* () {
    const issuer = yield* Config.String("CONVEX_SITE_URL");
    return HubConfig.layer({
      issuer,
      connectors: [
        {
          kind: "oidc",
          provider: "idp",
          name: "idp",
          label: "IdP",
          issuer: FAKE_IDP_ISSUER,
          scopes: ["openid"],
          promptLogin: true,
          clientId: Redacted.make("s6BhdRkqt3"),
          clientSecret: yield* Config.Redacted("IDP_CLIENT_SECRET"),
        },
      ],
      // `TEST_SERVICE` of src/core/testing/harness.ts, so that discovery is the memory host's in
      // the test.
      service: {
        name: "Test hub",
        terms: "https://hub.example.com/terms",
        privacy: "https://hub.example.com/privacy",
      },
    }).pipe(Layer.orDie);
  }),
).pipe(Layer.merge(SignInPage.layer()));

export const hub = convexHub(
  components.identityBroker,
  settings,
  github([{ repositoryId: "1", ownerId: "65" }]),
);

export const cleanup = hub.cleanup;
