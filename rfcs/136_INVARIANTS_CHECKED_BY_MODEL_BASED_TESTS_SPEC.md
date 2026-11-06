# RFC 136: The hub's invariants, checked by model-based tests

Decided 2026-11-06. Code at main `04c09aa1d` (broker 0.21.0). Inputs: the security review of
2026-11-06 (findings F1 to F5), and research PR 1900 (generated tests found shipped bugs in the
commit engine and the broker). Reviewed by Codex (test design) before the build.

## Decision

1. The rules of the hub are a table,
   [invariants.md](../packages/identity-broker/docs/invariants.md): one id and one sentence each.
   The tests check that table.
2. Two model-based tests in the broker package (fast-check) run random stories of real requests
   against the real component (the convex-test harness). A fake GitHub signs OIDC tokens with chosen
   `iat` and owners and can transfer a repository. Fake hosts serve, omit, or misname the
   verification file. A fake provider can hold a refresh answer open, so a block or a delete can
   land during the call. One fetch dispatcher serves all of them and reports any request it did not
   plan. After each step, every invariant that the answers and the rows can show is checked.
   - Property A: registration and ownership (`POST /hub-clients`, laptops, renew, self-delete,
     blocks, transfers, the clock).
   - Property B: API authorization and refresh (authorize, refresh start and finish as two steps,
     revoke, self-delete, admin delete, blocks, cleanup).
3. The tests land with the fixes in one PR. Each counterexample that a property found on the base
   commit stays as a fixed regression story.
4. CI runs 25 stories of at most 30 steps per property, from the fixed seed 136, in about 2 seconds
   each. `RFC136_RUNS`, `RFC136_SEED`, `RFC136_ONLY`, and `RFC136_REPORT` run more, another seed,
   one invariant, or print the stories.

## What the properties found on 0.21.0

| Finding        | Invariant                       | Story                                                                                                                  | Found at                   |
| -------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| F3             | `newOwnersOnlyForSuccess`       | One run of a new owner whose host has no verification file: the new-owners count grew by 1.                            | 25 runs                    |
| F3's write     | `refusedRegistrationRateLimits` | The same run set `newOwnersWindowStartedAt` on the owner's row.                                                        | regression of the F3 story |
| Refused writes | `refusedRegistrationRows`       | After a transfer, a run that a block refused during its host check still deleted the old owner's initial access token. | 275 runs                   |
| F5             | `ownerFollowsNewestProof`       | Transfer, a run of the new owner, then the old owner's retained token: the tenant's owner moved back.                  | 170 runs                   |
| F5, laptop     | `laptopTokenScope`              | The same replay gave the old owner a fresh initial access token, which registered a development client.                | regression of the F5 story |
| F4, block      | `noTokenAfterStop`              | A block committed while the provider answered a refresh: the provider access token still went out.                     | 25 runs                    |
| F4, delete     | `noTokenAfterStop`              | The client deleted itself while the provider answered: the token still went out.                                       | regression of the F4 story |
| F4, grants     | `deletedClientHasNoGrants`      | A client that deleted itself kept its refresh grants.                                                                  | 43 runs                    |
| Stale attempt  | `staleAttemptChangesNothing`    | An attempt whose 60-second claim ran out overwrote, or deleted, the grant of the attempt that claimed it next.         | 25 runs                    |

## The fixes (broker 0.22.0)

- `createClient` and `registerClient` make every refusal before the first write. The other owner's
  initial access tokens go only when the registration succeeds.
- `admit` counts the repository and the owner. A new owner counts in the new-owners window in
  `createClient`, when its registration succeeds; that window is read again there, so a window
  filled during the host check answers 429. `rateLimits.newOwnersWindowStartedAt` is removed.
- `tenants.ownerProofIssuedAt` keeps the newest accepted `iat`. A token of another owner that is
  older is refused with `stale_proof`. `iat` is a required claim.
- `claimRefresh` answers its `attempt`; `finishRefresh` and `failRefresh` change the grant only
  while that attempt holds it. `finishRefresh` reads the client, its app, and the blocks again after
  the provider answered, and the hub then answers `401 invalid_client` instead of the token.
- Self-delete and cap eviction remove the client's refresh grants. API authorization of a blocked
  app answers 403 before it goes to the provider.

After the fixes: 3,000 stories per property from seed 136 found nothing.

## Deploy

`rateLimits` rows of 0.21.0 hold `newOwnersWindowStartedAt`, which the 0.22.0 schema does not allow.
Clear the table on the hub's production deployment right before the merge (the rows are hourly
counts, so nothing is lost but the current hour's counts). Dry-run the deploy first.

## Later

- F1: a consent page for preview and development clients of third-party apps.
- F2: a per-IP rate limit on `auth.samebase.com` through an Alchemy Cloudflare `Ruleset`, which
  needs the record proxied, and the same sign-in allowance for first-party apps.
- More of the review's rules in the table: code redemption, sign-in through a third-party app's one
  connector, protocol fuzzing, and a nightly run with random seeds.
