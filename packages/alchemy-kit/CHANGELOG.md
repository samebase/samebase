# Changelog

## 0.2.0

- New entry `@samebase/alchemy-kit/run-record`: `withRunRecord` adds the record of the run to each
  stage output, over any state layer. It moved from `@samebase/alchemy-convex`, which now takes it
  from this package.

## 0.1.2

- No code change. A new README: a diagram of the store, a quick start, the options, the laptop
  setup, and the shape of a state file.

## 0.1.1

- No code change. The first release that the release workflow publishes, through npm trusted
  publishing.

## 0.1.0

- First release: `@samebase/alchemy-kit/github-state`, an Alchemy state store on a branch of a
  GitHub repository, with each secret sealed with AES-256-GCM under the key in
  `ALCHEMY_GITHUB_STATE_KEY`.
