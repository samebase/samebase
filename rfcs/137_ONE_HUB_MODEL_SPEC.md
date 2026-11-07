# 137 One hub model: connectors by enrollment, policy as hub code

## Document Control

- Status: Accepted on 2026-11-07, build in progress. Written after the Codex research of 2026-11-07
  (prior art, standards, policy as code, shared upstream clients, pause semantics), then reviewed by
  Codex (design review, 17 findings, all folded in), then decided by Nicu (the section "Decisions
  taken after the review").
- Amended on 2026-11-07, after the rollout: the hub's administrator can exempt one app or every app
  from the sign-in page, and GitHub shows its account picker on each sign-in (decisions 2, 5, and 9,
  the first decision taken after the review, and the validation). Designed by Claude, designed
  independently by Codex Sol, reviewed by Codex Astra, and decided by Nicu (broker 0.25.0). Decided
  by Nicu the same day: the exemptions are the one lever of the page and the broker applies them;
  the policy loses `consent` and keeps one input, and the hub has no code rule for the page.
- Amended again on 2026-11-07 (broker 0.26.0): the post-review decision 3, "one public Google client
  for every app", is withdrawn. Claude wrote it under the decisions taken after the review, and Nicu
  never made it: he had asked only whether the public clients should be named "Samebase" or
  "Samebase apps", and that other apps must not use his private client. The hub keeps four
  connectors, the private `google` and `github` and the public `google-apps` and `github-apps`
  (decision 9), and the administrator grants a private connector to one app (decision 10, from the
  Codex Sol research of 2026-11-07 on how Auth0, WorkOS, Clerk, Okta, Keycloak, Ory, Dex, ZITADEL,
  FusionAuth, and Cognito control which application may use which provider).
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
| Exemptions           | The hub's administrator exempts one app (a repository's production app, or its preview app with its development servers, bound to the repository's recorded owner) or every app from the sign-in page at `/moderation/sign-in-page`, with a reason and one event per change. They are the one lever of the page, and the broker applies them (decision 5).                                                                                                                   |
| Connector grants     | The hub's administrator grants one app (bound to the repository's recorded owner) a connector that the policy does not give it, at `/moderation/connector-grants`, with a reason and one event per change. Every step of a sign-in reads the grants again (decision 10).                                                                                                                                                                                                     |
| Ownership            | The tenant records its owner from the newest accepted GitHub token (`iat`); an older token of another owner is refused, so a transfer cannot be undone by a replay (RFC 136).                                                                                                                                                                                                                                                                                                |
| Subjects             | `sub` is `<provider>:<the provider's id>`, public, the same in every app (RFC 134).                                                                                                                                                                                                                                                                                                                                                                                          |
| Invariants           | `packages/identity-broker/docs/invariants.md`, checked by the model-based tests (RFC 136).                                                                                                                                                                                                                                                                                                                                                                                   |

## Decisions

### 1. Connectors by enrollment, not by trust

- `firstParty`, `connector` on the app, `reserved` on a connector, `ownRepositoryIds`, and
  `thirdPartyConnector` go.
- A hub offers connectors, each available to the registrations that the policy allows or that the
  hub's administrator granted (decision 10), with its OAuth client secret private to the hub. Our
  hub offers four: the private `google` and `github`, and the public `google-apps` and `github-apps`
  (decision 9).
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
- The policy has one input, the registration's facts, and decides connectors, resources, and the
  pause only. The sign-in page is not the policy's: it shows for every client unless the
  administrator's exemptions (decision 5) cover it, which never reach the policy. `/authorize` reads
  them from `signInPageExemptions` in the query that reads the client's facts, and applies them. The
  broker draws its own page, so it applies the admin's flag itself, the standard server behavior of
  Keycloak's per-client "Consent required" and Auth0's first-party flag; Ory Hydra passes its
  `skip_consent` to a consent app only because it has no page. A hub can neither skip nor force the
  page in code, and needs no such lever: the admin and the hub's operator are the same party.

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
`["google", "github", "google-apps", "github-apps"]`. OIDC Discovery section 3 and RFC 8414 section
2 allow additional metadata, so this is an extension, not a departure; the name is unregistered.
What a given client may use is in its registration answer, not in discovery.

### 5. One sign-in page

- One page, `signInPage`: one "Continue with" button per offered connector. It also names the host
  that gets the sign-in, the deploy, the GitHub repository, and what the app receives, and links the
  hub's privacy notice and terms (broker 0.23.0). The picker and the consent are the same page, so
  no user sees two pickers: either the app's page picked, or the hub's page does.
- The page shows for every client, unless the hub's administrator exempts its app or every app from
  it, from samebase.com's admin page (`/moderation/sign-in-page`). The exemptions are the one lever:
  the policy has no say in the page. An exempt client with one offered connector gets no page; with
  several it gets the picker without the consent text. A one-app row counts only while the tenant's
  recorded owner and the owner that registered the client are the row's owner. Setting a one-app row
  checks that the repository's recorded owner is still the one the admin saw, and removing one
  checks that the row is still bound to the owner the admin saw. The admin page marks a row that a
  recorded transfer left without a client as not active, and keeps its Remove. Each set and removal
  appends an event with the admin's email and reason. The page is decided at `/authorize` only: a
  sign-in that passed it finishes with that decision, and removing an exemption is not a revocation
  (a block is). Turning the page back on cannot take back what apps received while it was off.
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
    // The operator gets every connector in code; every other app the public pair, plus the
    // private connectors that the admin grants its app (decision 10).
    connectors: samebase(registration)
      ? ["google", "github", "google-apps", "github-apps"]
      : ["google-apps", "github-apps"],
    resources:
      samebase(registration) && registration.app === "samebase-connections"
        ? ["convex", "cloudflare", "github"]
        : [],
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
- Four connectors, two per provider, each with `selectAccount: true` (GitHub's
  `prompt=select_account`, changelog 2024-06-07):

  | Connector     | Credentials                                                 | Who may use it                                |
  | ------------- | ----------------------------------------------------------- | --------------------------------------------- |
  | `google`      | The operator's private Google client                        | The operator, and apps the admin grants it to |
  | `github`      | The operator's private GitHub OAuth App, "Samebase Account" | The operator, and apps the admin grants it to |
  | `google-apps` | The public Google client named "Samebase"                   | Every app                                     |
  | `github-apps` | The public GitHub OAuth App named "Samebase"                | Every app                                     |

- The operator is samebase/samebase under the samebase organization: samebase.com and this hub. It
  gets every connector in code, so no mistake on the admin page can lock samebase.com out.
- A user's `sub` comes from the provider: `google:<id>` through `google` and through `google-apps`
  alike. The `connector` claim names the connector; an app keys accounts by `sub` and checks
  `connector` against its method's connector name, not against the provider.
- No private repository id or name is in the code: samebase.com's repository and organization are
  public.

### 10. Connector grants

- The hub's administrator grants one broker app (a repository's production app, or its preview app
  with its development clients) a connector that the policy does not give it, from samebase.com's
  admin page (Connectors… on a client's menu), at `/moderation/connector-grants`, with a reason. The
  broker keeps the row in `connectorGrants` and appends one `connector_grant_change` event per
  change. A grant is additive: a client may enroll in and use the policy's connectors and its app's
  granted ones, of the hub's configured connectors.
- A grant is bound to the repository's recorded owner, as an exemption is: it counts only while the
  tenant's recorded owner and the owner that registered the client are the grant's; at registration,
  the owner of the incoming proof. A transfer stops it, an old client of a previous owner never gets
  it, and it counts again if the repository comes back to that owner. Granting refuses a stale view
  (409 `owner_changed`), revoking refuses a row bound to another owner than the one the admin saw.
- Unlike an exemption, a grant is read at every step, in the transaction that decides it: the
  registering mutation, the offered set at `/authorize`, `/continue`, the callback's claim and
  completion, and code exchange. Revoking a grant stops a sign-in at its next step; issued tokens
  and app sessions stay. A grant gives no API resource and skips no page; an exemption grants no
  connector.
- The default lives in the policy (hub code) and the exceptions in the broker's rows (the admin
  page), so a hub copied as a template keeps its defaults in code and its grants out of it. This is
  how Auth0 and FusionAuth enable connections per application and Cognito and Dex keep a provider
  list per client; Auth0's third-party apps get only the connections opened to every app, and no
  product lets a self-registered client choose the operator's private providers.
- A client uses a granted connector only after it enrolls in it: its next deploy registers a new
  client with the new set (alchemy-convex 0.33.0 replaces a client whose set differs).

## Non-goals

- A per-app privacy policy or terms (`policy_uri`, `tos_uri`): the standard says to show them when
  the app provides them, and no app does yet.
- Remembered consent per browser and app, and a Cancel on the sign-in page: added when a user needs
  them.
- Exemptions per owner or per repository, per connector, or per host; a row that puts the page back
  for one app while every app is exempt; an end time on a row; app owners setting their own; the
  pause or API resources from the admin page: added when a need appears.
- A second proof (GitLab, other CI): `proof` is a field of the policy input so a later proof fits,
  but nothing is built for it.
- Changing the registration limits, the caps, the expiry, the blocks, or the subjects.
- Recalling issued tokens or app sessions on a policy change (decision 2 names the boundary).

## Decisions taken after the review

1. **Consent for production: yes.** Codex rated the gap P1: with a shared GitHub OAuth App, GitHub
   reuses a user's earlier authorization of that app and asks nothing, and Google's account chooser
   is not consent to the downstream app either, so a stranger's production client would get a user's
   identity with no page that names the recipient (RFC 6749 section 10.12). Amended on 2026-11-07:
   every client gets the page unless the hub's administrator exempts its app or every app (decision
   5). The policy's `consent` field is gone, and so is samebase.com's code rule: the exemptions are
   the one lever, and samebase.com's production, whose recipient is the Samebase that Google's and
   GitHub's screens name, skips the page through an ordinary exemption set on the admin page. An
   exemption is an accepted product risk for the app's users, who then do not see which app gets
   their identity. GitHub's silent reuse is answered by its account picker, which the hub asks for
   on every GitHub sign-in, so no exempt app gets a user with no click.
2. **Pause scope: samebase.com's production only**, so that its previews and development servers
   feel the pause as a stranger's app does.
3. **Withdrawn.** This item said "one public Google client for every app, samebase.com included".
   Nicu never decided it; it reversed what he had asked, that other apps must not use his private
   client, and it put every app on his private Google client until the amendment of broker 0.26.0.
   The hub keeps a private and a public client per provider (decisions 9 and 10).
4. **Hub error pages for every refusal before the user continued** (decision 5).
5. **The public clients are named "Samebase"** at Google and at GitHub, not "Samebase apps": they
   are the sign-in service of Samebase for apps built with it, and the brand matches the homepage
   that describes the service. The private clients keep their own names, such as "Samebase Account"
   at GitHub.

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
- Exemptions (`src/client/signInPage.test.ts`): an empty table changes nothing; one app skips the
  page and its preview app and other apps do not; every app, new ones included; owner binding
  through a transfer, a transfer back, and an old client of another owner; a stale admin view (409)
  and an unknown app (404); one event per change and none for a change in place; a sign-in that
  passed `/authorize` finishes after the row goes; a block and the pause win; the page shows by
  default for every hub client, whatever its policy decides, and an exemption skips it; a
  development client follows its exempt preview app; the admin list says what decides each client's
  page; an exemption grants no API resource; GitHub's URL carries `prompt=select_account`. The hub's
  test shows samebase.com's production the page until an exemption is set through the moderation
  route. Property C plays the every-app exemption, the one lever of the page.
- A stranger walkthrough on `samebase/base`: register with `["google-apps", "github-apps"]`, sign in
  through both, see the page on a preview and in production; a registration with `["google"]` is
  refused with the public pair as the allowed names.
- Connector grants (decision 10): a grant opens a private connector to one app only, not to its
  preview app or another repository; a transfer stops it and its return restarts it for the owner's
  clients only; a stale grant or revoke is refused; a revoke during a held callback refuses the
  completion, and one after the code refuses the exchange; a grant gives no API resource and skips
  no page (`src/client/connectorGrants.test.ts`).
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
7. The amendment of 2026-11-07 (broker 0.25.0): additive, with no data to clear. After it deploys,
   samebase.com's production shows the hub's page like every app; the admin then sets the exemption
   of samebase.com's production app on samebase.com's admin page (Skip the sign-in page), which
   brings back its straight hop to Google or GitHub.
8. The amendment of broker 0.26.0, the four connectors and the grants: additive, with no data to
   clear. Its push fails while a required variable is missing, so in this order: a. Nicu changes the
   callback of the public "Samebase" GitHub OAuth App to
   `https://auth.samebase.com/connectors/github-apps/callback` and generates its secret, and checks
   that the public Google client lists `https://auth.samebase.com/connectors/google-apps/callback`.
   The GitHub environment `identity-hub` gets `AUTH_GITHUB_APPS_CLIENT_ID` and
   `AUTH_GITHUB_APPS_CLIENT_SECRET`; `GOOGLE_APPS_CLIENT_ID` and `GOOGLE_APPS_CLIENT_SECRET` are
   already there. b. Merge; the hub deploys with four connectors. Every app keeps its client and its
   enrollment. An app enrolled in `google` or `github` that is not the operator's and has no grant
   cannot sign in through them from then on. c. On samebase.com's admin page, Connectors… grants
   `google` to the production apps of the owner's other apps that keep the private client. d.
   Bristol and the starter move to `google-apps` (the starter also to `github-apps`) in their own
   pull requests, each with the consumer fix of `docs/consumers.md`: a profile mapping that checks
   `connector` against the method's connector name and keys the account by the provider in `sub`, as
   samebase.com's `readHubProfile` now does. Then the starter manifest is pinned again.

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
