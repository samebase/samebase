# 130 Provider Credential Encryption At Rest Spec

## Document Control

- Status: Accepted
- Owner: Samebase backend
- Last updated: 2026-10-29
- Related:
  - `research/2026-10-29-provider-credential-encryption-at-rest.md`
  - `apps/samebase/convex/sealedSecret.ts`

## Current Contract

Samebase stores every provider credential that it must send back to a provider as a sealed object,
never as plain text.

### Sealed and plain fields

| Table                             | Sealed fields                                                                               | Plain fields                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `organizationProviderCredentials` | `convex.auth.credential`, `cloudflare.auth.credential`, `cloudflare.auth.refreshCredential` | `method`, `credentialExpiresAt`, `clientId`     |
| `organizationCiCredentials`       | `cloudflare.apiToken`, `convex.accessToken`                                                 | `accountId`, `teamId`                           |
| `githubUserAuthorizations`        | `accessToken`, `refreshToken`                                                               | `accessTokenExpiresAt`, `refreshTokenExpiresAt` |

`codeVerifier` in `providerOAuthCallbackStates` stays plain: it lives ten minutes and is useless
without the matching authorization code.

### Sealed object

`vSealedSecret` is `{ keyId, iv, ciphertext }`:

- `keyId` names the key in the key ring that sealed the value.
- `iv` is 12 random bytes, base64url.
- `ciphertext` is the AES-256-GCM output with its 16-byte tag, base64url.

`sealSecret` and `openSecret` in `apps/samebase/convex/sealedSecret.ts` use Web Crypto. They run in
the default Convex runtime and in `"use node"` modules.

During the transition the stored fields accept a plain string too (`vStoredSecret`), so the rows
written before sealing pass the schema until the reseal action seals them. `openSecret` refuses a
plain string with "Stored credential is not sealed yet" and never quotes the value. Every writer
stores a sealed object. The narrowing change after the reseal run removes the string and
`vStoredSecret`.

### Key ring

The key ring is one Convex environment variable, `CREDENTIAL_KEYS`, which `convex/convex.config.ts`
declares as required:

```text
{"current":"<keyId>","keys":{"<keyId>":"<base64 of 32 random bytes>"}}
```

`sealSecret` seals with the `current` key. `openSecret` opens with the key that `keyId` names. Both
read the variable on every call and fail closed when it is missing or is not JSON, when a key is not
32 bytes of base64, when `current` has no key, or when `keyId` has no key. An error never quotes the
variable.

The operator sets the ring with `npx convex env set` on production (`--prod`) and on the dev
deployment. A preview deployment, a linked worktree backend and the CI backend generate their own
ring when they have none, in `apps/samebase/scripts/deploy-preview.ts`,
`scripts/convex-seed-dev-auth.ts` and `scripts/ci-bootstrap-convex.ts`. A deployment keeps the ring
that it has, because its credential rows are sealed under it.

### Seal only in actions

`sealSecret` takes the action context, so a query or a mutation cannot call it. Only actions have
system randomness for the IV. In queries and mutations `crypto.getRandomValues` is a seeded
deterministic generator, and a repeated IV under one key breaks AES-GCM.

The action that obtains a credential seals it and passes the sealed object to the internal mutation
that stores it. Queries return sealed objects. The action that calls the provider opens the
credential right before the call.

No query or mutation argument carries a plain provider credential. Public actions receive a pasted
token from the browser and seal it before any mutation. No Workflow step argument or result carries
a credential: `write_actions_secrets` reads the sealed CI tokens through a query inside its action
and opens them there.

### Additional authenticated data

The AAD of a sealed value is `<table>/<ownerId>/<field path>`:

- `organizationProviderCredentials/<organizationId>/convex.auth.credential`
- `organizationProviderCredentials/<organizationId>/cloudflare.auth.credential`
- `organizationProviderCredentials/<organizationId>/cloudflare.auth.refreshCredential`
- `organizationCiCredentials/<organizationId>/cloudflare.apiToken`
- `organizationCiCredentials/<organizationId>/convex.accessToken`
- `githubUserAuthorizations/<userId>/accessToken`
- `githubUserAuthorizations/<userId>/refreshToken`

A sealed value moved to another owner or another field does not open. The builders live next to the
table shapes: `organizationProviderCredentialAad` and `organizationCiCredentialAad` in
`convex/organization/providerCredentialModel.ts`, `githubUserAuthorizationAad` in
`convex/githubUserAuthorizationModel.ts`.

Concurrent-change checks compare sealed objects: `providerAuthMatches` compares `keyId`, `iv`, and
`ciphertext`, and the provider snapshot hash hashes the same three fields. Every seal draws a new
IV, so equal sealed objects mean an unchanged row. During the transition two plain strings compare
by equality, and a plain string never equals a sealed object.

### Rotation

Rotation is an operator step:

1. Add a new key to `keys` and set `current` to its id. New seals use the new key; rows sealed under
   an older key still open.
2. Run `resealCredentials:run` on the deployment. It opens each value under an older key with that
   key and seals it again under `current`, with the same AAD.
3. Remove the old key from the ring.

`resealCredentials:run` in `apps/samebase/convex/resealCredentials.ts` also seals a plain string.
The return of its `readRows` query is the one internal boundary that a plain string crosses. Its
write mutations receive a plain field only as its SHA-256, re-read the row, and change a field only
when it still holds the value that the action read, so a concurrent refresh or reconnect keeps its
value; the action counts that field as `skippedChanged`, and the next run handles it. A second run
reports every field unchanged. The action returns counts only.

## Non-Goals

- A KMS, envelope encryption, per-row data keys, or HKDF.
- Protection against a Convex team role that reads environment variables, or against a compromised
  deployment. The research note names the triggers for a KMS.
- Sealing Samebase's own secrets, which are environment variables, or the MCP and handoff tokens,
  which Samebase stores as hashes.

## Validation

- `convex/sealedSecret.test.ts`: round trip, a value sealed under an older key after rotation, a
  changed AAD, a changed ciphertext, an unknown key id, and a malformed ring.
- `convex/users.convex.test.ts`, "connects a Cloudflare API token to its only accessible account":
  the action seals the token, the row holds the sealed object, and a later action opens it for its
  provider call.
- `convex/providerOAuthCallbacks.convex.test.ts`: each OAuth callback stores sealed tokens that open
  for their organization and field.
- `convex/cloudflareOAuth.convex.test.ts`: a Cloudflare token refresh seals the new tokens.
- `convex/organizationCiCredentials.convex.test.ts` and `convex/devAuth.convex.test.ts`: saved and
  seeded CI tokens are sealed.
- `convex/repositoryProvisioningWorkflow.convex.test.ts`: the Actions secrets step writes the opened
  CI tokens.
- `convex/resealCredentials.convex.test.ts`: the reseal run seals the plain provider, CI, and GitHub
  fields for their AAD and a second run changes nothing; a value under an older key moves to the
  current key; a write keeps a field that changed after the read.
- `convex/sealedSecret.test.ts`: `openSecret` refuses a plain string without quoting it.

## Rollout

The rows that exist before this change hold plain strings, and production holds the connections of
other users, so the rows are sealed in place:

1. `CREDENTIAL_KEYS` is set on production and on the dev deployment (done 2026-10-29).
2. Merge this change. The deploy passes because the stored fields accept the old strings.
3. Run `resealCredentials:run` once on production and once on the dev deployment, from
   `apps/samebase` (for production with the prefix of `docs/convex-production-reads.md`):
   `npx convex run --prod resealCredentials:run`. Between the deploy and the run, a provider call
   that meets a plain string fails with the "not sealed yet" error.
4. Confirm with a read-only count that no stored field holds a string.
5. A follow-up change narrows the fields to the sealed object and deletes `vStoredSecret`.

Previews, linked worktrees, and CI need nothing: their rows are new and sealed.
