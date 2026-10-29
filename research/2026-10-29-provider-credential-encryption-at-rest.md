# Provider credential storage: moving stored tokens from plain text to encrypted at rest

Date: October 29, 2026. Status: research. It informs the decision on how Samebase stores the
Cloudflare, Convex and GitHub credentials of its organizations before Samebase goes public. It does
not define product behavior.

- Base: `origin/main` at `e72b5e537`.
- Code facts come from reading `apps/samebase/convex`; every claim names a file and line.
- Platform facts come from the Convex docs, the Convex changelog and the open-source backend source
  on `main`; nothing was run against Convex Cloud 1.48. Standard and peer facts come from OWASP,
  NIST, provider docs and open-source code. Section 9 lists the sources; "unverified" marks what no
  primary source confirmed.

## Summary

1. Verdict: encrypt every stored provider credential with AES-256-GCM through Web Crypto inside
   Convex, with the key in a versioned key ring in one Convex environment variable, the row identity
   as additional authenticated data, and the key id stored beside the ciphertext. This is the
   pattern OWASP and NIST describe and the pattern Rails, Infisical, Documenso and the current n8n
   cipher use (section 3). It needs no new service, no new dependency, and about one small module
   plus typed changes at the write and read sites (section 5).
2. Seal only in actions. In Convex queries and mutations `crypto.getRandomValues` is a seeded
   deterministic generator, so a nonce made there is not random, and AES-GCM with a repeated nonce
   loses confidentiality and integrity. Every credential write already starts in an action (section
   1), so the mutations store sealed values and never see a plain token.
3. What it buys: a database export, backup, snapshot, log line, error report or dashboard data view
   shows ciphertext only, and backups and exports do not contain environment variables. What it does
   not buy: a Convex team member with `deployment:env:view` (every built-in role) reads the key and
   the rows, and a compromised deployment decrypts everything it can read. That boundary needs a
   KMS, which costs about $1 a month on AWS and is the second step, with named triggers (section 6).
4. Checked during implementation, correcting this note's first draft: the Workflow component's
   journal holds no credential. The provisioning step that writes GitHub Actions secrets reads the
   CI tokens through an internal query inside its action, so no step argument or result carries a
   token (section 5.6).
5. Rollout without a migration: the schema change turns the credential strings into sealed objects,
   so existing rows have to be removed before the deploy and the providers reconnected. With one or
   two organizations this is one operator step, and it keeps the repo's no-migration rule.

## 1. What Samebase stores today, verified in the code

Every row below sits in the production Convex database as a plain string.

| Table or store                                    | Secret fields                                                                                         | Lifetime of the secret                                                     | Written by                                                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `organizationProviderCredentials.convex.auth`     | `credential` (Convex OAuth access token or pasted access token)                                       | no expiry                                                                  | `connectConvex`, `apps/samebase/convex/organizationProviderCredentials.ts:565`                             |
| `organizationProviderCredentials.cloudflare.auth` | `credential`, `refreshCredential` (Cloudflare OAuth or MCP OAuth), or `credential` (pasted API token) | OAuth access token short, refresh token long; API token as the user set it | `connectCloudflare` (`:685`), `replaceCloudflareCredential*` (`:886`, `:905`, `:921`)                      |
| `organizationCiCredentials`                       | `cloudflare.apiToken`, `convex.accessToken` (pasted CI tokens)                                        | no expiry                                                                  | `setCloudflareCiCredential` (`:1144`, inserts at `:1174` and `:1211`)                                      |
| `githubUserAuthorizations`                        | `accessToken` (8 h), `refreshToken` (6 months)                                                        | 8 h / 6 months, refreshed in place                                         | `upsertGitHubUserAuthorization`, `apps/samebase/convex/githubUserAuthorizations.ts:258` (insert at `:325`) |
| `providerOAuthCallbackStates`                     | `codeVerifier` (PKCE)                                                                                 | 10 minutes                                                                 | `apps/samebase/convex/oauthState.ts:84`                                                                    |

The shapes are `vOAuthAuth`, `vCloudflareOAuthAuth`, `vMcpOAuthAuth` and `vApiKeyAuth` in
`apps/samebase/convex/providerAuth.ts:5`, and `vGitHubUserAuthorization` in
`apps/samebase/convex/githubUserAuthorizationModel.ts:6`.

What is already right:

- MCP access tokens, refresh tokens, authorization codes, browser login tokens and agent browser
  handoff tokens are stored as SHA-256 hashes (`apps/samebase/convex/mcp/model.ts:61`, `:99`,
  `:117`, `:138`; `apps/samebase/convex/agentBrowserHandoff.ts:272`). Samebase only verifies these
  tokens, so a hash is the right storage. Convex Auth 2.0.0-beta.0 does the same for its refresh
  tokens.
- GitHub App installation tokens are minted on demand from `GITHUB_APP_PRIVATE_KEY` and not stored.
  Convex deploy keys are created through the management API and written to GitHub Actions secrets;
  only `deployKeyName` is stored (`apps/samebase/convex/repository/database.ts:31`).
- Alchemy state read from a customer deployment drops every `Redacted` value before it leaves the
  action (`apps/samebase/convex/repository/alchemyState.ts:83`).
- Provider API logging redacts keys named `authorization`, `secret`, `token` and values that look
  like tokens (`apps/samebase/convex/providerApiLog.ts:24`, `:79`).
- No public query or mutation carries a credential. Every function whose args or result include
  `vStandardProviderAuth` or `vCloudflareProviderAuth` is an `internalQuery` or `internalMutation`
  (`organizationProviderCredentials.ts:264`, `:564`, `:685`, `:886`, `:905`, `:921`, `:937`).
- Every credential write starts in an action: `connectCloudflareWithApiToken`
  (`apps/samebase/convex/users.ts:895`), `connectConvexWithApiKey` (`:964`), `setCloudflareCiToken`
  (`:1069`), the OAuth callback HTTP actions, the token refresh actions, and the dev seed action
  (`apps/samebase/convex/devAuth.ts:365`). The internal mutations only store what the action hands
  them.
- Samebase's own secrets (`GITHUB_APP_PRIVATE_KEY`, `AUTH_PRIVATE_KEY`, OAuth client secrets, Polar
  tokens) are Convex environment variables declared in `apps/samebase/convex/convex.config.ts:12`,
  not table rows.

Where the plain values are read, non-test modules, counted with one grep of `.auth.credential`,
`.refreshCredential`, `.apiToken`, `.accessToken` and `.refreshToken`:

| Module                                                                | Reads       |
| --------------------------------------------------------------------- | ----------- |
| `githubUserAuthorizations.ts`                                         | 17          |
| `cloudflareOAuth.ts`                                                  | 13          |
| `githubAppInstallation.ts`                                            | 6           |
| `users.ts`, `repository/database.ts`, `repository/actions.ts`         | 4 each      |
| `repository/cloudflare.ts`, `convexOAuth.ts`, `cloudflareMcpOAuth.ts` | 3 each      |
| 14 other modules                                                      | 1 to 2 each |

`cloudflareProviderAccess.ts` runs in the Node runtime (`"use node"`); the rest run in the default
V8 runtime. The helper has to work in both, and Web Crypto does.

Two places compare credential values to detect a concurrent change: `providerAuthMatches` in
`apps/samebase/convex/providerAuth.ts:35` and `hashOrganizationProviderSnapshot` in
`apps/samebase/convex/providerAuthFingerprint.ts:32`. Both receive the stored value back as the
expected value, so comparing sealed objects keeps them correct without any decryption (section 5.5).

## 2. Who can read the rows on Convex Cloud

| Fact                                                                                                                                                          | Source                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Customer data is encrypted at rest with 256-bit AES; Convex is SOC 2 Type 2 and runs on AWS; "limited and necessary personnel" get audited production access. | convex.dev/security            |
| `deployment:data:view` and `deployment:backups:download` belong to Team Admin, Team Developer and Project Admin, production included.                         | docs: team-management roles    |
| `deployment:env:view` belongs to the same three roles; only Team Admin and Project Admin write production values. `npx convex env get` prints values.         | docs: roles, CLI env           |
| Backups and `npx convex export` contain table documents (and file storage as an option) but not environment variables. Backups keep 7 days, weekly ones 14.   | docs: backup and restore       |
| The open-source backend keeps environment variables in the `_environment_variables` system table of the same deployment database. Encryption is not stated.   | convex-backend source          |
| The team audit log and the deployment History page record member, deploy, index and env-var events. No doc says they record data reads.                       | docs: teams, history           |
| Convex has no secret or encrypted value type; its encryption page says functions see decrypted data and points to client-side encryption.                     | docs: types; convex.dev/can-do |
| An admin key gives complete control over a deployment.                                                                                                        | docs: deploy key types         |

So the Convex-side encryption protects the disks, not the rows: anyone with a dashboard role, a
deploy key, an export or a backup reads the tokens. The application-level layer closes the export,
backup, log and dashboard-data paths. It does not close the env-var path, because the same roles
read it.

## 3. The standard

Reference guidance:

- OWASP Cryptographic Storage: AES, "ideally 256 bits", in an authenticated mode; GCM or CCM is the
  first preference. The data-encryption key (DEK) encrypts data, the key-encryption key (KEK)
  encrypts the DEK, "the KEK must be stored separately". Rotation: encrypt new data with the new
  key, mark each item "with the ID of the key", keep retired keys for a period. Keys in a separate
  location from the data, HSM or KMS preferred; "avoid storing keys in environment variables"
  because debug dumps leak them. Rails documents env vars as an accepted location.
- OWASP Secrets Management 7.1: AES-256-GCM or ChaCha20-Poly1305. 7.3: do not store keys next to the
  secrets they encrypt unless the keys are themselves encrypted.
- NIST SP 800-38D: 96-bit IVs; with random IVs no more than 2^32 encryptions per key across all
  instances. NIST SP 800-57 Part 1 Rev 5, Table 1: data-encryption and key-wrapping keys have an
  originator-usage period under two years.
- Additional authenticated data (AAD) binds a ciphertext to its row. AWS calls it the encryption
  context; Supabase Vault puts other columns of the row into it, so a value copied to another row
  fails to decrypt.
- GitHub's best practices for GitHub Apps: "encrypt the tokens on your back end", store refresh
  tokens apart from access tokens, keep the private key in a key vault.

What peers do with stored third-party tokens:

| Product                | Cipher and key                                                                                                                           | Note                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Rails Active Record    | AES-256-GCM; `primary_key` list in credentials, PBKDF2 derivation, random IV, key reference stored per message, `previous:` for rotation | The reference implementation of the pattern                                         |
| n8n (current `master`) | AES-256-GCM with HKDF, `keyId:` prefix, DEKs wrapped by the instance key from `N8N_ENCRYPTION_KEY`                                       | Replaces the legacy AES-256-CBC with MD5 derivation and no authentication           |
| Infisical              | AES-256-GCM; a root key in the database encrypted by `ROOT_ENCRYPTION_KEY` or an HSM; org and project keys under it                      | Envelope hierarchy, KEK in env                                                      |
| Documenso              | XChaCha20-Poly1305 through `@noble/ciphers`, random nonce, key = SHA-256 of an env var                                                   | The same cipher library Samebase already ships                                      |
| Cal.com                | AES-256-CBC with a random IV, key in `CALENDSO_ENCRYPTION_KEY`                                                                           | No authentication; not a model                                                      |
| Supabase Vault         | libsodium AEAD in Postgres; the per-project root key lives in Supabase's backend, never in the database; backups hold ciphertext only    | Platform-level version of the same separation                                       |
| WorkOS Pipes (2026-08) | One DEK per object, KEKs in an HSM that cannot export plaintext                                                                          | The hosted "token vault" shape                                                      |
| Netlify                | Secret env values are write-only with "encrypted storage"; method not published                                                          | Statement only                                                                      |
| GitHub itself          | Stolen-token alert (2022): tokens "are not stored by GitHub in their original, usable formats"; audit logs show hashed renderings        | GitHub only verifies tokens it issued, so hashing applies to it and not to Samebase |

Common pattern: one AEAD cipher (almost always AES-256-GCM), a random nonce per value, the key
outside the database in an env var or a secret manager, a key id or version beside the ciphertext,
and at larger scale a KMS or HSM root that wraps per-tenant or per-object DEKs.

## 4. Options

| Option                                                                                                                        | Protects against                                                            | Does not protect against                                                                   | Cost and dependency                                                                                                                                                                                | Verdict                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| A. Keep plain rows, rely on Convex disk encryption                                                                            | Disk theft at AWS                                                           | Everything in section 2                                                                    | none                                                                                                                                                                                               | Not acceptable for a public product                                                                            |
| B. AES-256-GCM in Convex functions, key ring in one env var (this note's recommendation)                                      | Exports, backups, snapshots, logs, error reports, dashboard data view       | Team roles reading env vars; a compromised deployment                                      | none; about one module and typed edits                                                                                                                                                             | Do now                                                                                                         |
| C. Community component (`convex-secret-store` 0.2.0, listed in the Convex components directory; `convex-vault` is not on npm) | Same as B                                                                   | Same as B; its `put` is a mutation that draws the DEK and the IV from the seeded generator | one maintainer, Apache-2.0, tested; own `secrets` and `secretEvents` tables; depends on `convex-helpers`; the credential leaves the row, so the two comparison sites in section 1 need a new basis | No. The in-house module is smaller than the integration, keeps the field in the row, and seals only in actions |
| D. AWS KMS envelope: KEK in KMS, DEK wrapped, `Decrypt` per action through `aws4fetch`                                        | B, plus a non-exportable root key, a log entry per decrypt, instant disable | An attacker who holds the deployment's KMS credentials                                     | about $1 a month at 10k calls; an AWS account and IAM user; one network call                                                                                                                       | Second step, on a trigger (section 6)                                                                          |
| E. Hosted token vault (WorkOS Vault or Pipes, Infisical KMS)                                                                  | As D, plus per-tenant keys and token refresh handled by the vendor          | As D                                                                                       | pricing unverified; high lock-in; every provider call depends on the vendor                                                                                                                        | No for now; revisit if Samebase wants to stop holding tokens at all                                            |
| F. Hash the tokens                                                                                                            | n/a                                                                         | n/a                                                                                        | n/a                                                                                                                                                                                                | Not applicable: Samebase sends these tokens to providers, so it needs the plaintext back                       |
| G. Shorter-lived tokens only                                                                                                  | Shrinks the damage window                                                   | Convex OAuth tokens have no documented expiry or refresh                                   | none                                                                                                                                                                                               | Complement, not a substitute (section 7)                                                                       |

## 5. Recommended design

### 5.1 Stored shape

One validator for every sealed field, in a small module such as
`apps/samebase/convex/sealedSecret.ts`:

```ts
export const vSealedSecret = object({
  keyId: string(),
  iv: string(), // 12 random bytes, base64url
  ciphertext: string(), // AES-256-GCM output with the 16-byte tag, base64url
});
```

`credential`, `refreshCredential`, `apiToken`, `accessToken` and `refreshToken` in the tables of
section 1 change from `string()` to `vSealedSecret`. The type checker then names every read and
write site, which is the review surface for the change. `codeVerifier` in
`providerOAuthCallbackStates` stays a string: it lives ten minutes and is useless without the
matching authorization code.

### 5.2 Cipher and runtime

AES-256-GCM through `crypto.subtle` (`importKey` raw, `encrypt`, `decrypt`). The Convex changelog of
2025-03-23 announces AES-GCM in SubtleCrypto, and the backend source implements raw import, encrypt
and decrypt for AES-GCM in the default runtime; Node has it natively; the test harness runs on
`@edge-runtime/vm`, which has it too. No HKDF and no derived keys: with well under 2^32 values per
key, one 256-bit key per key id used directly is inside the NIST bound and is the smaller design.

### 5.3 Key ring

One environment variable per deployment, declared in `convex.config.ts` as `v.string()` and read
through the typed `env`:

```text
CREDENTIAL_KEYS={"current":"2026-10","keys":{"2026-10":"<base64 of 32 random bytes>"}}
```

The operator sets the ring with `npx convex env set` on production and on the dev deployment
(`generateCredentialKeys` in `scripts/lib/convexAuthKeys.ts` makes one). A preview deployment, a
linked worktree backend and the CI backend generate their own ring when they have none, and keep the
ring they have. Env values may hold 8 KiB, so the ring can carry several keys. Rotation as shipped:
add the new key and set `current` to it; new seals use it, and rows sealed under an older key still
open, so the old key stays in the ring until the refresh and reconnect flows have rewritten its
rows. A one-off internal action that opens each row and seals it again is the step to add only when
a key must be retired before that. Nothing in the stored shape changes, so rotation is an operator
task and not a data migration.

### 5.4 Seal only in actions

In the default runtime, queries and mutations run on a per-run seeded ChaCha12 generator for both
`Math.random` and `crypto.getRandomValues`, and `crypto.subtle.generateKey` fails there. Actions get
system randomness. Whether a mutation retry after a write conflict reuses the seed is unverified;
the design does not depend on the answer. The seal function takes the action context, so a mutation
cannot call it:

```ts
/**
Seals a credential for storage. Needs an action: only actions have system randomness for the IV, a
mutation's crypto.getRandomValues is a seeded deterministic generator and a repeated IV breaks AES-GCM.
*/
export async function sealSecret(
  ctx: Pick<ActionCtx, "runAction">,
  args: { plaintext: string; aad: string },
): Promise<SealedSecret>;

export async function openSecret(args: { sealed: SealedSecret; aad: string }): Promise<string>;
```

Every write path in section 1 already starts in an action, so the actions seal and the internal
mutations (`connectConvex`, `connectCloudflare`, `replaceCloudflareCredential*`,
`setCloudflareCiCredential`, `upsertGitHubUserAuthorization`'s callers) take `vSealedSecret` where
they take `string()` today. `openSecret` runs anywhere, in practice right before the provider call
in the action that uses the token.

### 5.5 Additional authenticated data

`aad` is the owner and the field, for example
`organizationProviderCredentials/<organizationId>/cloudflare.auth.refreshCredential` and
`githubUserAuthorizations/<userId>/refreshToken`. A ciphertext moved to another organization,
another user or another field then fails to open. The two comparison sites of section 1 keep working
on the sealed objects: the expected value is the stored object itself, so equal `ciphertext` strings
mean an unchanged row, and the snapshot hash hashes the sealed strings instead of the plain ones.

### 5.6 The Workflow journal

The first draft of this note said that one provisioning step returned the CI tokens and the next
received them, so the Workflow component's journal (`steps.args` and `runResult`, both `v.any()`)
held copies. Checked during implementation: that was wrong. `readActionsSecretsTarget` is an
internal query that the `writeActionsSecrets` action calls with `ctx.runQuery`
(`repositoryProvisioningWorkflowActions.ts:907` on `e72b5e537`), and the step returns null, so no
step argument or result carries a credential. The rule to keep: a step that needs a credential reads
it through a query inside its action and opens it there; a credential never becomes a step argument
or result. `workflow.cleanup` is out of scope for this change, since the journal holds no secret.

### 5.7 Rollout

The schema change makes a plain-string row invalid, and Convex refuses a deploy whose rows do not
match the schema. The rollout is: remove the current rows (disconnect Convex and Cloudflare on the
Providers page, remove the CI tokens, revoke the GitHub App authorization), deploy, reconnect. With
one or two organizations this is a few minutes and no migration code, which matches the repo rule
that required-field narrowings ship without migrations. If Samebase has many organizations by the
time this ships, the alternative is a one-off internal action that seals each existing row before
the schema narrows, run once by the operator.

### 5.8 Tests

Start from the state axes: key id present or absent in the ring, AAD matching or moved, ciphertext
tampered, round trip through an action and a mutation in `convex-test`, and the two comparison
functions on sealed values. The test setup sets `CREDENTIAL_KEYS` with a throwaway key.

## 6. When to add a KMS

Keep the stored shape of 5.1 and change only where the key ring comes from: the env var holds a
KMS-wrapped DEK per key id, and an action calls AWS KMS `Decrypt` (SigV4 through `aws4fetch`, which
needs only `fetch`, SHA-256 digest and HMAC sign, all present in the default runtime; running it
from Convex is unverified) to unwrap it before sealing or opening. What it adds: a root key that
never leaves the HSM, a CloudTrail entry per decrypt, instant revocation by disabling the key, and a
key owner who is not the deployment owner. What it still does not stop: an attacker who holds the
IAM credentials the deployment uses. Cost at Samebase volume: about $1 a month (one key-month plus
20k free requests). Triggers that justify it:

- a second person gets Team Developer or higher on the Convex team and should not be able to read
  customer tokens;
- a customer or a compliance process asks for key custody or a per-decrypt audit trail;
- Samebase holds credentials for more organizations than one operator would want to re-issue after
  an incident.

Google Cloud KMS and Azure Key Vault are equivalent and cost less, but their auth from a bare HTTPS
runtime is heavier (service-account JWT or Entra client credentials). HCP Vault Dedicated starts
near $450 a month. Cloudflare has no KMS API; its Secrets Store serves Workers bindings only, so a
Cloudflare-based key would mean a self-built Worker that holds the key, which is a KMS without the
audit log.

## 7. Related facts that are not this change

- The Convex organization credential is the most dangerous row: an OAuth app token is team-scoped,
  can read and write every project of the team, and the token response has no `expires_in` and no
  refresh token. Convex deploy keys created with an OAuth token "will use the same OAuth-granted
  token", so a deploy key that Samebase writes into a repository's Actions secrets can carry
  team-wide power. That is a blast-radius issue of the provisioning design, tracked separately from
  storage at rest.
- Cloudflare API tokens do not expire by default; a user can set `expires_on`, IP filtering and a
  narrow permission set, and account-owned tokens (`cfat_`) are the service-principal form that
  survives the user who created them. Cloudflare's own recommendation for third parties is OAuth,
  whose client registration is public. Cloudflare MCP OAuth issues 1 h access and 30 day rotating
  refresh tokens. The Providers page copy can steer users to a TTL and to OAuth; it does not remove
  the need to encrypt what is stored.
- GitHub user tokens are already short: 8 h access, 6 month single-use refresh. Installation tokens
  can be scoped at mint time with `repository_ids` and `permissions`.
- GitHub Actions secrets are write-only for Samebase: sealed client-side with libsodium, never
  readable back through the API, 48 KB each, 100 per repository.

## 8. Open items

- Unverified: whether a Convex mutation retry reuses the random seed. The design seals only in
  actions, so the answer does not change it.
- Unverified: whether Convex backups include component tables such as the Workflow journal. The
  journal holds no credential (section 5.6), so the answer does not change the design.
- Not run: AES-GCM through `crypto.subtle` against Convex Cloud 1.48 and `aws4fetch` from a Convex
  action. The first implementation PR proves the first in `convex-test` and on the dev deployment.
- Pricing unverified: WorkOS Vault and the Infisical plan that includes KMS.

## 9. Sources

Code: the files and lines named in section 1. Platform: Convex docs on runtimes, environment
variables, limits, backup and restore, team roles, deploy key types, OAuth applications and the
management API OpenAPI document; the Convex changelog vol. 18 (AES-GCM in SubtleCrypto); the
`get-convex/convex-backend` crates `isolate/src/ops/subtle_crypto`, `isolate/src/ops/crypto.rs`,
`isolate/src/environment/udf` and `model/src/environment_variables`; the `get-convex/workflow`
README and `src/component/schema.ts` at 0.4.10; the `get-convex/convex-auth` v2.0.0-beta.0 component
schema and crypto module; convex.dev/security and convex.dev/can-do/encryption. Standard: OWASP
Cryptographic Storage and Secrets Management cheat sheets, NIST SP 800-38D and SP 800-57 Part 1 Rev
5, AWS KMS encryption context and envelope encryption docs, GitHub "Best practices for creating a
GitHub App". Peers: Rails Active Record Encryption guide, n8n `packages/core/src/encryption`,
Infisical `backend/src/services/kms/kms-service.ts`, Documenso `packages/lib/universal/crypto.ts`,
Cal.com `packages/lib/crypto.ts`, Supabase Vault docs, WorkOS Pipes announcement, Netlify secrets
controller docs, GitHub stolen OAuth token alert (2022). Providers: Cloudflare API token, OAuth and
account-owned token docs, `cloudflare/workers-sdk` `packages/workers-auth`,
`cloudflare/mcp-server-cloudflare` `packages/mcp-common`, GitHub docs on refreshing user access
tokens, installation access tokens and Actions secrets. KMS pricing: AWS KMS, Google Cloud KMS,
Azure retail prices API, HCP Vault tiers, Infisical pricing, Cloudflare Secrets Store and Workers
pricing.
