# Recorded GitHub state store payloads

Recorded on 2026-11-17 with `gh api` from a private test repository. Its branch
`alchemy-state-store` was written by `@samebase/alchemy-kit` 0.2.0 (`github-state`) for the stack
`github-state-spike`. The stage `demo` was deployed with `withRunRecord`, so its output holds the
run record under `samebase.run`. The stage `ci` was deployed without it, so its output has no run
record.

| File                                                                         | Request                                                                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| ref.json                                                                     | `GET /repos/{owner}/{repo}/git/ref/heads/alchemy-state-store`                                                                         |
| tree.json                                                                    | `GET /repos/{owner}/{repo}/git/trees/{commit sha}?recursive=1` with the commit of ref.json                                            |
| branch/github-state-spike/demo/\*.json, branch/github-state-spike/ci/\*.json | `GET /repos/{owner}/{repo}/git/blobs/{sha}` with `Accept: application/vnd.github.raw+json`, the text of each file of the stage folder |

Replaced values: the owner and name of the private repository are `my-org` and `my-app` in every
payload, URLs and file texts included. Each sealed secret value is `v1.fixture.fixture`. The SHAs
and sizes are the recorded ones. The `README.md` of the branch is not recorded: the reader never
reads it. No file contains a token or a key.
