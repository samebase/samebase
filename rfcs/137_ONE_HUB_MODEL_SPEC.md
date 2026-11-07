# 137 One hub model: connectors by enrollment, policy as hub code

## Document Control

- Status: Accepted on 2026-11-07, build in progress. Written after the Codex research of 2026-11-07
  (prior art, standards, policy as code, shared upstream clients, pause semantics), then reviewed by
  Codex (design review, 17 findings, all folded in), then decided by Nicu (the section "Decisions
  taken after the review").
- Owner: Nicu Chiciuc
- Supersedes, once accepted: the hub model of RFC 130 (registration without an account), RFC 133
  (development clients with the initial access token), RFC 134 (one path, own apps by repository),
  and RFC 135 (every row in the broker). Their decisions that stay are restated here, so this is the
  one place that describes the hub. RFC 129 (host verification), RFC 131 (expiry), and RFC 136
  (invariants and model-based tests) stay as they are and are linked.
- Code at `main` `a659915a8`: `@samebase/identity-broker` 0.23.0, `@samebase/alchemy-convex` 0.32.0.

## Why

One flag, `firstParty`, set on each app at registration from the hub's `OWN_REPOSITORY_IDS` list,
decides six unrelated things: which connectors an app may use, whether `?connector=` in the
authorize URL is honored or silently ignored, API resources, the pause, the sign-in allowance, and
the consent page. The owner's own apps never see what a stranger's app sees, so the public path is
tested only by tests. An app cannot offer both Google and GitHub unless the hub owner lists its
repository, and a stranger's app can offer Google only. The policy of who gets what is an id list
baked into the broker's config shape, when the hub, which is code, could decide.

## The hub in one place

What stays. Each line names the document that holds the detail.

| Part                 | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The broker and a hub | `@samebase/identity-broker` holds every table and every rule. A hub (`apps/identity-hub`, auth.samebase.com) is configuration: connectors, API resources, env, keys, the cron, the stack, and now a policy function (RFC 135, amended by decision 2).                                                                                                                                                                                                                        |
| Registration         | `POST /hub-clients` gives one client to one deployment of an app. A GitHub Actions run proves its repository with GitHub's OIDC token; a development server proves the app with the app's initial access token, which a production run got. The return address proves its host with `/samebase-verification.json`. `/hub-clients` is the hub's own registration format, not RFC 7591's; each client manages itself with RFC 7592 reads and deletes (RFC 129, 130, 133, 134). |
| Apps and tenants     | A repository is the tenant `gh-<id>`. An app is `gh-<id>-<hash of the name>`, with `-preview` for previews and development. At most 10 apps per tenant and 30 clients per app; the oldest preview client makes way at the cap. A replaced production client stays valid until the administrator deletes it, because the hub cannot know which client a deployment holds (RFC 134, 135).                                                                                      |
| Expiry               | A preview or development client lives 14 days after its last deploy, dev start, sign-in, resource authorization, or refresh. A production client never expires (RFC 131).                                                                                                                                                                                                                                                                                                    |
| Limits               | `POST /hub-clients`: 30 per repository and 100 per owner per hour, and 50 new owners per hour for the whole hub. Sign-ins: a token bucket per tenant (RFC 130, 136).                                                                                                                                                                                                                                                                                                         |
| Blocks               | The hub's administrator blocks a repository or an owner at `/moderation/blocks`. A block stops registration, renewal, sign-in, code exchange, and refresh at once, in the transaction that reads it (RFC 135).                                                                                                                                                                                                                                                               |
| Ownership            | The tenant records its owner from the newest accepted GitHub token (`iat`); an older token of another owner is refused, so a transfer cannot be undone by a replay (RFC 136).                                                                                                                                                                                                                                                                                                |
| Subjects             | `sub` is `<provider>:<the provider's id>`, public, the same in every app (RFC 134).                                                                                                                                                                                                                                                                                                                                                                                          |
| Invariants           | `packages/identity-broker/docs/invariants.md`, checked by the model-based tests (RFC 136).                                                                                                                                                                                                                                                                                                                                                                                   |

## Decisions

### 1. Connectors by enrollment, not by trust

- `firstParty`, `connector` on the app, `reserved` on a connector, `ownRepositoryIds`, and
  `thirdPartyConnector` go.
- A hub offers connectors. Every connector is public: available to the registrations that the policy
  allows, with its OAuth client secret private to the hub. Our hub offers `google` and `github`.
- `POST /hub-clients` takes `connectors: string[]`: at least one name, each `[a-z0-9-]{1,64}`,
  duplicates collapsed, order ignored. Each must be a connector of the hub and one that the policy
  allows this registration. The hub records the set on the client; the 201 answer and the RFC 7592
  read repeat it. A set that names an unknown or disallowed connector is refused with 400 and the
  names the policy allows.
- Enrollment is per client and immutable. A stack whose `connectors` differ from its saved client's
  registers a new client, as it does today for a changed return address or deployment type. A
  preview registration cannot change production's enrollment. A replacement does not revoke the
  older production client (see "Apps and tenants").
- An empty effective set means no sign-in, never "all" (unlike Dex's empty allowlist).
- `registration.register`, the low-level mutation for a host with another proof, takes `connectors`
  too. That host is its own policy; the policy function below is `/hub-clients`'s.

Prior art: Auth0 enables connections per application and selects one with `connection=`; Dex has
`allowedConnectors` per client and `connector_id=`; Keycloak's `kc_idp_hint` is a hint, not access
control. The fit here is Dex's explicit per-client list with Auth0's enrollment model.

### 2. Policy as hub code

The broker defines the contract and enforces it. The hub implements the policy as a function.

```ts
type Registration = {
  /** GitHub's numeric repository id, and `owner/name` at registration. */
  repositoryId: string;
  repository: string;
  /** At registration: the owner GitHub's token names. At use: the tenant's recorded owner. */
  ownerId: string;
  app: string;
  deploymentType: "production" | "preview" | "development";
  redirectUri: string;
  proof: "github-actions" | "initial-access-token";
};

type Policy = {
  /** The connectors this registration may enroll in, and may use now. */
  connectors: string[];
  /** The API resources this client may authorize, by provider name. */
  resources: string[];
  /** The sign-in page asks before the first hop to a provider. */
  consent: boolean;
  /** Evaluated at registration and at each use. */
  paused: boolean;
};

registration.policy: (registration: Registration) => Policy;
```

Where each input comes from, so a policy knows what it can trust:

| Field                                   | GitHub Actions run                                                           | Development server                                                       | At use                             |
| --------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------- |
| `repositoryId`, `repository`, `ownerId` | GitHub's signed token (`repository_id`, `repository`, `repository_owner_id`) | The initial access token's row, which a production run wrote             | The client's and the tenant's rows |
| `deploymentType`                        | The token's event and ref: `prod` or `pr-<n>`                                | Always `development`                                                     | The client's row                   |
| `app`, `redirectUri`                    | The request body; the host of the address is verified by the file            | The body; a loopback address needs no file; `app` must match the token's | The client's row                   |
| `proof`                                 | `github-actions`                                                             | `initial-access-token`                                                   | The client's `registeredBy.kind`   |

- The policy is evaluated at registration (enrollment must be a subset of `connectors`; a paused
  registration is refused) and at each use: `/authorize`, `/continue`, the connector callback, code
  exchange, API authorization, and provider refresh. At use, the input is rebuilt from the client
  row and the tenant row, so a changed policy takes effect at once for existing clients, without
  re-registration.
- The policy runs in the host's HTTP action, once per request. The mutation that enforces the
  decision receives the facts the policy saw (the owner id, the enrollment) and refuses when its
  rows say otherwise, as `finishRefresh` already refuses a stale attempt. Moderation (blocks) stays
  a row that every mutation reads in its own transaction. A policy change is configuration, not a
  moderation action.
- What "at once" means: a withdrawn connector, resource, or pause stops every later issuance by the
  broker under the rules of this document. It recalls nothing issued: an id_token and an access
  token live to their expiry, `/userinfo` answers a valid access token, a provider access token
  already released stays usable at the provider, and an app's own session is the app's.
- At sign-in, the offered connectors are the client's enrollment intersected with the policy's
  `connectors`. The hub never substitutes a connector.
- A policy that throws or returns a malformed value refuses the request
  (`503 temporarily_unavailable`, or an error page) and writes nothing. Nothing is allowed by
  default, and a missing env value is a configuration failure, never "allow".
- RFC 135 is amended: the hub supplies decisions as code; the broker still owns validation,
  persistence, and enforcement.

### 3. The authorize contract

- `connector` is a space-delimited list, as `scope`, `prompt`, and `acr_values` are (OIDC Core
  section 3.1.2.1). In a URL it reads `connector=google+github`. A parameter with an empty or
  whitespace-only value counts as omitted (RFC 6749 section 3.1).
  - One name: the app chose on its own page. No picker; straight to that connector.
  - No parameter: the page offers every connector the client may use.
  - Several names: the page offers those. This shares the one-name mechanism: the request stores a
    set, of size one or more.
- The request stores the requested set. `/continue`, the callback, and code exchange accept only a
  connector that is in that set, in the client's enrollment, and allowed by the policy now. A user
  cannot edit the `/continue` link into another connector.
- A name that the client is not enrolled in answers `invalid_request`. An enrolled connector that
  the policy no longer allows is not offered; when none remains, "Sign-in is off" (403).
- The id_token and UserInfo keep the `connector` claim as one string, the connector the user signed
  in with, never the requested list.
- `connector` is an unregistered extension parameter kept by choice: it is deployed in every
  consumer. RFC 6749 section 8.2 recommends a vendor prefix for such parameters; the departure is
  named in `docs/design.md`.

### 4. Discovery

The discovery document adds `connectors_supported`, the names of the hub's connectors, such as
`["google", "github"]`. OIDC Discovery section 3 and RFC 8414 section 2 allow additional metadata,
so this is an extension, not a departure; the name is unregistered. What a given client may use is
in its registration answer, not in discovery.

### 5. One sign-in page

- One page, `signInPage`: one "Continue with" button per offered connector. With `consent: true` it
  also names the host that gets the sign-in, the deploy, the GitHub repository, and what the app
  receives, and links the hub's privacy notice and terms (broker 0.23.0). The picker and the consent
  are the same page, so no user sees two pickers: either the app's page picked, or the hub's page
  does.
- With one offered connector and `consent: false`, there is no page.
- Refusals before the user continued from the hub's page (or, with no page, before the redirect to
  the provider) end on an error page of the hub, for every client: no redirect to a return address
  that the user has not accepted (RFC 9700 section 4.11.2). After the user continued, every outcome
  goes to the client's registered return address as an authorization response, also a denial at the
  provider, an expired callback, and an API authorization failure: the user chose that destination.
  This departs from OIDC Core section 3.1.2.6 for the first group and is named in `docs/design.md`.
  An app that opened the hub in a popup sees the hub's page in that popup.

### 6. Pause

A paused registration or client:

| Operation                                      | Paused                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| New registration, development clients included | Refuse                                                                                                  |
| New sign-in or API authorization               | Refuse                                                                                                  |
| Callback completion and code exchange          | Refuse                                                                                                  |
| Provider refresh                               | Refuse before the provider is called; a refresh already at the provider keeps its rotation (decision 7) |
| Client read and lease renewal                  | Allow                                                                                                   |
| Revocation, self-delete, moderation            | Allow                                                                                                   |

Renewal stays allowed so that a short pause ends without expired clients. Blocks stay stronger than
the pause. Our hub: `APPS_PAUSED=true` pauses every app but samebase.com's (scope: open decision 2).

### 7. API resources

- `resources` names the providers a client may authorize. It is evaluated at API authorization and
  at code exchange of a resource code.
- A refresh has two evaluations: admission, before the provider is called (a withdrawn resource or a
  pause refuses here), and release, after the provider answered. The provider's rotation is saved
  before the release decision, as today; a release that the policy refuses, or that fails, keeps the
  grant with its new refresh token and answers `401 invalid_client`. A client that loses a resource
  can still revoke its grants.
- Our hub gives resources to one app of samebase.com: `samebase-connections`, the app that holds
  users' Cloudflare, Convex, and GitHub connections, proven by the samebase repository and owner.
  Its sign-in app and every other app of the monorepo get none.

### 8. Quotas

The sign-in token bucket per tenant applies to every app, samebase.com included (finding F2 of the
2026-11-06 review). The registration limits do not change.

### 9. Our hub

`apps/identity-hub/convex/broker.ts`:

```ts
/** samebase/samebase and the samebase organization: public ids. */
const SAMEBASE_REPOSITORY_ID = "1021726325";
const SAMEBASE_OWNER_ID = "285392744";
const samebase = (registration: Registration) =>
  registration.repositoryId === SAMEBASE_REPOSITORY_ID &&
  registration.ownerId === SAMEBASE_OWNER_ID;

registration: {
  name: "Samebase",
  terms: "https://samebase.com/terms",
  privacy: "https://samebase.com/privacy",
  moderationKey: () => env.HUB_MODERATION_KEY,
  policy: (registration) => ({
    connectors: ["google", "github"],
    resources:
      samebase(registration) && registration.app === "samebase-connections"
        ? ["convex", "cloudflare", "github"]
        : [],
    // For every client, production included. This field is the lever: a later rule can return
    // false for a case that needs no page, without a change to the broker.
    consent: true,
    // samebase.com's production keeps running; its previews and development servers feel the
    // pause as a stranger's app does.
    paused:
      env.APPS_PAUSED === "true" &&
      !(samebase(registration) && registration.deploymentType === "production"),
  }),
}
```

- The owner id is checked with the repository id: a transferred repository keeps its numeric id, and
  the stale-proof rule stops only a replay of the old owner, not the new owner's forward claim.
- `google` is the Google OAuth client of the public project (today `google-apps`), with
  `selectAccount: true`. `github` is a new public GitHub OAuth App for every app of the hub. The
  private Google client and the team's GitHub login OAuth App leave the hub. samebase.com, the
  owner's other apps, and every stranger's app go through the same two connectors.
- No private repository id or name is in the code: samebase.com's repository and organization are
  public.

## Non-goals

- A per-app privacy policy or terms (`policy_uri`, `tos_uri`): the standard says to show them when
  the app provides them, and no app does yet.
- Remembered consent per browser and app, and a Cancel on the sign-in page: added when a user needs
  them.
- A second proof (GitLab, other CI): `proof` is a field of the policy input so a later proof fits,
  but nothing is built for it.
- Changing the registration limits, the caps, the expiry, the blocks, or the subjects.
- Recalling issued tokens or app sessions on a policy change (decision 2 names the boundary).

## Decisions taken after the review

1. **Consent for production: yes.** Codex rated the gap P1: with a shared GitHub OAuth App, GitHub
   reuses a user's earlier authorization of that app and asks nothing, and Google's account chooser
   is not consent to the downstream app either, so a stranger's production client would get a user's
   identity with no page that names the recipient (RFC 6749 section 10.12). Every client gets the
   page. The policy's `consent` field keeps the way open: when a case is found that needs no page,
   the hub's policy returns false for it, and the broker does not change.
2. **Pause scope: samebase.com's production only**, so that its previews and development servers
   feel the pause as a stranger's app does.
3. **One public Google client for every app**, samebase.com included, with the hub's homepage,
   privacy notice, and Google verification describing the shared sign-in service. Codex found no
   documented prohibition and named the shared reputation as the accepted cost.
4. **Hub error pages for every refusal before the user continued** (decision 5).
5. **The public clients are named "Samebase"** at Google and at GitHub, not "Samebase apps": they
   are the one sign-in service of Samebase, for its own apps and for apps built with it, and the
   brand matches the homepage that describes the service. The private clients that leave the hub
   free the name.

## Validation

- Unit tests: enrollment validation, grammar, and the 400 with allowed names; the authorize list
  rules (one, none, several, empty value, not enrolled, no longer allowed); the stored set at
  `/continue`; policy evaluation at every use point; a throwing policy refuses and writes nothing;
  pause at each operation of the table; the two refresh evaluations with a held provider answer;
  resources per client.
- Model-based tests (RFC 136): property A (registration and ownership) gains "policy shrinks",
  "policy grows", and "pause", and its `appStable` loses trust and gains immutable enrollment.
  Property B (refresh) gains the pause and a withdrawn resource under `noTokenAfterStop`. A new
  property C (sign-in: authorize, continue, the callback with a held provider answer, redemption)
  proves `enrollmentHonored`: no user reaches a connector outside the request's set, the client's
  enrollment, and the current policy.
- Page screenshots (`pnpm run test:pages`): picker with two connectors, consent with two, consent
  with one, plain with one.
- A stranger walkthrough on `samebase/base`: register with `["google", "github"]`, sign in through
  both, see the page on a preview and in production.
- After the rollout: sign in to samebase.com through both connectors with an existing account, and
  reconnect Cloudflare and GitHub.

## Rollout

Every repository of the team moves the same day, as for store version 6. Codex would split the
credential change (step 1 and the env of step 3) into a later phase; one day is chosen because the
hub has no outside users yet.

1. Nicu, before the merge: create the public GitHub OAuth App, named "Samebase", with the callback
   `https://auth.samebase.com/connectors/github/callback` (until it exists, the hub's `github`
   connector keeps the team's GitHub login OAuth App behind it, as `google` kept the private client
   until now); add `https://auth.samebase.com/connectors/google/callback` to the public Google
   client's redirect URIs; make the hub's homepage, privacy notice, and Google verification describe
   the shared sign-in service; put the two client ids and secrets into the GitHub environment
   `identity-hub` as `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_GITHUB_CLIENT_ID`, and
   `AUTH_GITHUB_CLIENT_SECRET`, replacing the private clients' values.
2. Broker 0.24.0 and the hub, one PR: the schema (apps lose `firstParty` and `connector`; clients
   gain `connectors`; auth requests gain the requested set), the policy contract, discovery, the
   authorize list, the page, the pause table, the two refresh evaluations, the docs. The hub stack
   (`alchemy.run.ts`), the workflow (`identity-hub.yml`), and `convex.config.ts` drop
   `GOOGLE_APPS_CLIENT_ID`, `GOOGLE_APPS_CLIENT_SECRET`, `OWN_REPOSITORY_IDS`, and
   `THIRD_PARTY_PAUSED`, and add `APPS_PAUSED`.
3. The maintenance window, in this order: set `THIRD_PARTY_PAUSED=true` on the hub (stops every
   stranger's registration) and deploy none of the own repositories; clear `apps`, `clients`,
   `authRequests`, `authorizationCodes`, `resourceRequests`, and `refreshGrants` (`apps` and
   `clients` change shape; the other four point at them); read the six tables and confirm they are
   empty; merge, which deploys the hub; confirm the schema push; the new env replaces the pause.
   `initialAccessTokens`, `tenants`, `blocks`, `events`, `rateLimits`, `signIns`, and `keys` stay.
4. alchemy-convex 0.33.0: `Convex.SharedHubClient` takes `connectors` (required), sends it, saves
   it, and registers a new client when it differs from the saved set. The store version does not
   change; the saved attributes do, so a run of 0.32.0 cannot read a row that 0.33.0 wrote and the
   reverse.
5. The same day, production stages first: the samebase stacks, `samebase/base`, scout, and the
   owner's two private apps move to 0.33.0 with `connectors: ["google", "github"]` (base: what its
   sign-in page offers), and each production app deploys once. From step 3 until an app's deploy,
   its saved client is gone and its sign-in fails; the deploy gets it a new client (`renew` answers
   401, the stack registers again) and, for production, a new initial access token. Then previews
   redeploy and development servers restart, in that order, because a development run reads the
   production row. samebase.com's users reconnect Cloudflare and GitHub: their grants were bound to
   the old `samebase-connections` client.
6. Docs: the hub README, the broker README, `docs/design.md` (the departures of decisions 3 and 5),
   `docs/consumers.md`, `docs/invariants.md`, samebase.com's sign-in mapping
   (`convex/identity/signIn.ts`, which keeps one connector per auth method), the starter changelog
   (apps set `connectors` and deploy once), and the starter manifest (`template:export --update`
   after `samebase/base` merges). RFC 130, 133, 134, and 135 move to `archive/` with a link here.

## Sources

- OIDC Core 1.0 sections 3.1.2.1 and 3.1.2.2 (list-valued parameters; unrecognized parameters are
  ignored) and 3.1.2.6 (the authentication error response). OIDC Discovery 1.0 section 3 and RFC
  8414 section 2 (additional metadata). RFC 7591 section 2 and RFC 7592 (client metadata, reads).
  RFC 6749 sections 3.1 (an empty parameter counts as omitted), 8.2 (parameter names), and 10.12
  (client awareness and consent). RFC 9700 section 4.11.2 (redirects to unreviewed URIs).
- GitHub: an OAuth App's authorization is reused on later sign-ins without a prompt.
- Auth0 `connection=`; Dex `allowedConnectors` and `connector_id=`; Keycloak `kc_idp_hint`; WorkOS
  `provider=`; ZITADEL `urn:zitadel:iam:org:idp:id:<id>` in `scope`.
- Google OAuth policies and project guidance: one brand per project; authentication-only scopes need
  brand verification only; the service's homepage and privacy notice describe what it does.
