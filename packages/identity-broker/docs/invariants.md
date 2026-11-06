# Invariants

The rules that the model-based tests check after every step of a random story (RFC 136). Each story
is a list of real requests against the real component, with a fake GitHub, fake hosts, a fake
provider, and a clock. The model predicts what each request may do; a check compares the prediction,
the answer, and the rows. A failure prints the seed, the minimized story, and the invariant it
broke.

| Id                              | The rule                                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `noServerError`                 | No request answers 500.                                                                                                                        |
| `noUnexpectedRequest`           | The broker sends no request that the story did not plan: only GitHub's keys, the planned hosts, and the provider.                              |
| `refusedRegistrationRows`       | A refused registration leaves `tenants`, `initialAccessTokens`, `apps`, `clients`, and the registration events exactly as they were.           |
| `refusedRegistrationRateLimits` | A refused registration changes in `rateLimits` only the counts of its repository and its owner.                                                |
| `newOwnersOnlyForSuccess`       | The new-owners count grows by one for a new owner whose registration succeeded, and by nothing for any other request.                          |
| `blockedGetsNothing`            | A blocked repository or owner gets no new client and no renewal, also when the block lands while the hub fetches the verification file.        |
| `ownerFollowsNewestProof`       | A tenant's owner is the owner of the newest accepted GitHub token by `iat`. A retained older token never moves it back.                        |
| `laptopTokenScope`              | An initial access token registers only a development client of its own app and repository, and stops when a later run replaces or moves it.    |
| `appStable`                     | An app never changes its tenant, its trust, or its connector, and is never deleted.                                                            |
| `caps`                          | An app has at most 30 clients and a tenant at most 10 apps. The stories are too short to reach a cap; fixed tests cover the caps and eviction. |
| `clientsMatchModel`             | Every client row is one that the model created, and a client goes only by its own delete, an admin delete, or the cap's eviction.              |
| `deletedClientDenied`           | A deleted client's registration access token answers 401.                                                                                      |
| `selfDelete`                    | A preview or development client can delete itself; a production client cannot.                                                                 |
| `adminDelete`                   | `DELETE /moderation/clients/<id>` answers 200, with `changed` true only for a client that still existed.                                       |
| `revoke`                        | A client revokes its own refresh token (200), also while it is blocked; a deleted client cannot authenticate (401).                            |
| `noTokenAfterStop`              | No provider access token goes out after a block, a client delete, or the end of the grant, also when that lands while the provider answers.    |
| `staleAttemptChangesNothing`    | A refresh attempt that another attempt took over neither overwrites the provider refresh token nor deletes the grant.                          |
| `deletedClientHasNoGrants`      | A deleted client has no refresh grants once the scheduled jobs drain.                                                                          |

Property A (`src/client/registration.model.test.ts`) covers registration and ownership. Property B
(`src/client/refresh.model.test.ts`) covers API authorization and refresh. Each runs 25 stories of
at most 30 steps in CI. Change the run with these env vars: `RFC136_RUNS` (stories), `RFC136_SEED`
(the default is 136), `RFC136_ONLY` (one invariant), and `RFC136_REPORT` (print the stories).
