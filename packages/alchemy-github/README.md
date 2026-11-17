# @samebase/alchemy-github

An [Alchemy v2](https://alchemy.run) state store on a branch of your GitHub repository. Each
resource is one JSON file on the branch. Each secret in it is sealed with AES-256-GCM under a key
that you keep as a secret. You need no cloud account for the state: the repository and its
`GITHUB_TOKEN` are enough.

The sealing is the package's own until Alchemy releases state encryption
([alchemy-run/alchemy#3167](https://github.com/alchemy-run/alchemy/pull/3167)).

## Install

```sh
pnpm add -D @samebase/alchemy-github alchemy@2.0.0-beta.85 effect
```

## Use

In `alchemy.run.ts`:

```ts
import * as GitHubState from "@samebase/alchemy-github";

export default Alchemy.Stack("my-app", { providers, state: GitHubState.state() }, program);
```

Options, all optional:

- `repository`: `owner/name`. The default is `GITHUB_REPOSITORY`, else the `origin` remote.
- `branch`: the state branch. The default is `alchemy-state-store`.
- `key`: a `Redacted` key. The default is the environment variable `ALCHEMY_GITHUB_STATE_KEY`.

The token is `GITHUB_TOKEN` or `GH_TOKEN`. It needs write access to the contents of the repository.

## The key

Make the key once and keep it as the repository secret `ALCHEMY_GITHUB_STATE_KEY`:

```sh
openssl rand -base64 32 | gh secret set ALCHEMY_GITHUB_STATE_KEY
```

Without the key, the store stops before it reads or writes anything. With a different key, it stops
at the first secret that does not open. If you lose the key, you cannot open the secrets on the
branch.

## GitHub Actions

```yaml
permissions:
  contents: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      # ... set up Node and install
      - run: pnpm exec alchemy deploy --stage prod --yes --no-input
        env:
          GITHUB_TOKEN: ${{ github.token }}
          ALCHEMY_GITHUB_STATE_KEY: ${{ secrets.ALCHEMY_GITHUB_STATE_KEY }}
```

## The branch

```
alchemy-state-store                 the state
  README.md
  {stack}/{stage}/{resource}.json
  {stack}/{stage}/__stack_output__.json
alchemy-state-store-lock            the deploy lock of each stage
  README.md
  {stack}/{stage}/__lease__.json
```

Both are orphan branches, made with a README on the first write. A secret in a file is
`{"__redacted__": {"__sealed__": "v1.<iv>.<ciphertext>"}}`; every other value is plain JSON. A
sealed value opens only in the file that it was sealed for.

All the writes that are waiting go into one commit, with a message such as
`my-app prod: set Worker, Bucket`. When another deploy moved the branch first, the store reads the
new head and tries again. A second deploy of the same stage fails at once while the first holds the
lock.

## Limits

- Each write is a commit, about 2 seconds.
- Each read asks GitHub for the head of the branch, one API call, and a record that the run did not
  read before is one more. A destroy of 40 resources is about 350 calls. The `GITHUB_TOKEN` of
  GitHub Actions allows 1,000 requests per hour per repository.
- A run always sees its own writes. Just after a write of another run, GitHub can still answer with
  the branch from before that write, and the store cannot see that.
- In a public repository, the state is public, except the sealed secrets.
- A ruleset that requires pull requests on all branches, or a tool that deletes stale branches,
  breaks the store. Keep both branches out of such rules.
- A laptop deploy needs the key and a token. For `dev-` stages, local state is simpler.
