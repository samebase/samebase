# Recorded GitHub state store payloads

Recorded on 2026-11-17 with `gh api` from a private test repository. Its branch
`alchemy-state-store` was written by `@samebase/alchemy-kit` 0.2.0 (`github-state`) for the stack
`github-state-spike`. The stage `demo` was deployed with `withRunRecord`, so its output holds the
run record under `samebase.run`. The stage `ci` was deployed without it, so its output has no run
record.

| File                                                                         | Request                                                                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| matchingRefs.json                                                            | `GET /repos/{owner}/{repo}/git/matching-refs/heads/alchemy-state-store`                                                               |
| tree.json                                                                    | `GET /repos/{owner}/{repo}/git/trees/{commit sha}?recursive=1` with the commit of the state branch in matchingRefs.json               |
| branch/github-state-spike/demo/\*.json, branch/github-state-spike/ci/\*.json | `GET /repos/{owner}/{repo}/git/blobs/{sha}` with `Accept: application/vnd.github.raw+json`, the text of each file of the stage folder |

GitHub lists each ref whose name starts with `alchemy-state-store`, so matchingRefs.json also holds
the lock branch `alchemy-state-store-lock`. The state branch in it is the one of the tree. The lock
branch was recorded later the same day.

Replaced values: the owner and name of the private repository are `my-org` and `my-app` in every
payload, URLs and file texts included. Each sealed secret value is `v1.fixture.fixture`. The SHAs
and sizes are the recorded ones. The `README.md` of the branch is not recorded: the reader never
reads it. No file contains a token or a key.

## sealed/Secret.txt

Made on 2026-11-19 with the state codec of the Alchemy preview build
`https://pkg.alchemy.run/alchemy/pr:3167:44fd6d0` (`makeSealingCodec` with `passphraseEncryption`),
not read from GitHub. The kit on that build writes each state file with this codec. The record is
`branch/github-state-spike/demo/Secret.json` for the stack `github-state-spike` and the stage
`demo`, with the dummy secret `dummy-fixture-secret` sealed under the dummy passphrase
`dummy-fixture-passphrase`. The text is the codec output as it is: the `alchemy:sealed:1:` header
line, then the JSON.
