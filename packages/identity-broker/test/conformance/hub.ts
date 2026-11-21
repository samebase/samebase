// The hub under the OpenID conformance suite: the real Worker runtime and its SQLite Durable Object
// (src/hosts/cloudflare/hub.ts), in workerd through `alchemy dev`, with local settings. Only the
// settings differ from the deployed hub: the issuer, the two connectors, and the sign-in service.
//
// - `fake`: the fake OpenID provider of the OP plans (fake-upstream.ts). The OP plans test the hub
//   as a provider, not its upstream.
// - `suite`: the suite itself as an OpenID provider, for the RP plan, which tests this connector.
//
// The two client secrets and the signing keys are `Config.Redacted` reads, so each is a secret
// binding with the value of the `alchemy dev` process's variable (run.ts reads them from mode-600
// files). No `global_fetch_strictly_public` flag: it would refuse every fetch to the suite and the
// fake provider, which are on loopback here.
import * as Cloudflare from "@alchemy.run/cloudflare";
import { Config, Effect, Layer, Redacted } from "effect";
import { HubConfig, SignInPage } from "../../src/core/services.ts";
import { hubRuntime } from "../../src/hosts/cloudflare/hub.ts";
import { github } from "../../src/layers/github/routes.ts";
import {
  FAKE_CONNECTOR_CLIENT_ID,
  FAKE_ISSUER,
  HUB_PORT,
  ISSUER,
  SUITE_CONNECTOR_CLIENT_ID,
  SUITE_RP_ISSUER,
} from "./addresses.ts";

const settings = Layer.unwrap(
  Effect.gen(function* () {
    return HubConfig.layer({
      issuer: ISSUER,
      connectors: [
        {
          kind: "oidc",
          provider: "fake",
          name: "fake",
          label: "Fake",
          issuer: FAKE_ISSUER,
          scopes: ["openid", "email", "profile"],
          promptLogin: true,
          clientId: Redacted.make(FAKE_CONNECTOR_CLIENT_ID),
          clientSecret: yield* Config.Redacted("FAKE_UPSTREAM_CLIENT_SECRET"),
        },
        {
          kind: "oidc",
          provider: "suite",
          name: "suite",
          label: "Suite",
          issuer: SUITE_RP_ISSUER,
          scopes: ["openid", "email", "profile"],
          promptLogin: false,
          clientId: Redacted.make(SUITE_CONNECTOR_CLIENT_ID),
          clientSecret: yield* Config.Redacted("SUITE_CONNECTOR_CLIENT_SECRET"),
        },
      ],
      service: {
        name: "Conformance hub",
        terms: `${ISSUER}/terms`,
        privacy: `${ISSUER}/privacy`,
      },
    }).pipe(Layer.orDie);
  }),
).pipe(Layer.merge(SignInPage.layer()));

export default class ConformanceHub extends Cloudflare.Worker<ConformanceHub>()(
  "Hub",
  {
    name: "ibe-conformance-hub",
    main: import.meta.url,
    compatibility: { date: "2026-10-26" },
    dev: { host: "127.0.0.1", port: HUB_PORT, strictPort: true },
  },
  // The suite registers no client at `POST /register`: the fixture (admin.ts) writes each card
  // with its own allow-list.
  hubRuntime(settings, github([])),
) {}
