# @samebase/alchemy-kit

[![npm](https://img.shields.io/npm/v/@samebase/alchemy-kit)](https://www.npmjs.com/package/@samebase/alchemy-kit)
[![license](https://img.shields.io/npm/l/@samebase/alchemy-kit)](https://github.com/samebase/samebase/blob/main/packages/alchemy-kit/LICENSE)

Parts for [Alchemy v2](https://alchemy.run). Each part is its own entry, so your stack loads only
the part that it imports.

| Part                                      | Entry                                | What it is                                                                 |
| ----------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| [GitHub state store](#github-state-store) | `@samebase/alchemy-kit/github-state` | The state of a stack on a branch of its GitHub repository, secrets sealed. |

> The source is in
> [`packages/alchemy-kit`](https://github.com/samebase/samebase/tree/main/packages/alchemy-kit) of
> the Samebase monorepo. Use [GitHub Issues](https://github.com/samebase/samebase/issues) to report
> a problem or request a change.

## GitHub state store

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/samebase/samebase/main/packages/alchemy-kit/docs/github-state-dark.svg">
  <img src="https://raw.githubusercontent.com/samebase/samebase/main/packages/alchemy-kit/docs/github-state-light.svg" alt="A deploy, on your laptop or in GitHub Actions, holds the key ALCHEMY_GITHUB_STATE_KEY and seals each secret before it leaves the run. In your GitHub repository, the deploy takes the lock on the branch alchemy-state-store-lock, then reads and commits the state on the branch alchemy-state-store: one JSON file for each resource. The branch main holds your code and alchemy.run.ts." width="100%">
</picture>

Alchemy keeps a record of each resource that it deployed. This store keeps that record on a branch
of the repository that the stack deploys from. The state needs no cloud account and no server: the
repository and its `GITHUB_TOKEN` are enough.

- **One JSON file for each resource.** You read the state on github.com, and each deploy is a commit
  that names what it changed.
- **Sealed secrets.** Each secret is sealed with AES-256-GCM before it leaves the run. The key is a
  repository secret.
- **One deploy of a stage at a time.** A second deploy of the same stage fails at once.

### Quick start

**1. Install.**

```sh
pnpm add -D @samebase/alchemy-kit alchemy@2.0.0-beta.85 effect
```

**2. Give the store to your stack**, in `alchemy.run.ts`:

```ts
import * as GitHubState from "@samebase/alchemy-kit/github-state";
import * as Alchemy from "alchemy";

export default Alchemy.Stack(
  "my-app",
  {
    providers,
    state: GitHubState.state(),
  },
  program,
);
```

**3. Make the key**, once, and keep it as a repository secret:

```sh
openssl rand -base64 32 | gh secret set ALCHEMY_GITHUB_STATE_KEY
```

**4. Deploy from GitHub Actions.** The job needs write access to the contents of the repository:

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

The first deploy makes the two branches.

### Options

`GitHubState.state()` takes one object. Each field is optional.

| Option       | Default                                             | What it is                                                   |
| ------------ | --------------------------------------------------- | ------------------------------------------------------------ |
| `repository` | `GITHUB_REPOSITORY`, else the `origin` remote       | The repository, as `owner/name`.                             |
| `branch`     | `alchemy-state-store`                               | The state branch. The lock branch is this name with `-lock`. |
| `key`        | The environment variable `ALCHEMY_GITHUB_STATE_KEY` | The key, as a `Redacted` string.                             |

The token is `GITHUB_TOKEN`, else `GH_TOKEN`.

### The key

The key is 32 random bytes in base64. Each deploy of the repository uses the same key.

- Without the key, the store stops before it reads or writes anything.
- With a different key, the store stops at the first secret that does not open.
- If you lose the key, you cannot open the secrets on the branch.

The sealing is the package's own until Alchemy releases state encryption
([alchemy-run/alchemy#3167](https://github.com/alchemy-run/alchemy/pull/3167)).

### From your laptop

The store reads the token and the key from the environment of the process. A `.env` file does not
set them.

```sh
export GITHUB_TOKEN="$(gh auth token)"
export ALCHEMY_GITHUB_STATE_KEY="$(cat .state-key)" # a file that git ignores
pnpm exec alchemy deploy --stage dev-me
```

For a `dev-` stage that only you use, Alchemy's local state is simpler.

### What is on the branches

```
alchemy-state-store                 the state
  README.md
  {stack}/{stage}/{resource}.json
  {stack}/{stage}/__stack_output__.json
alchemy-state-store-lock            the deploy lock of each stage
  README.md
  {stack}/{stage}/__lease__.json
```

Both are orphan branches: they share no history with your code. A resource file is plain JSON,
except its secrets:

```jsonc
// my-app/prod/ApiKey.json, shortened
{
  "status": "created",
  "resourceType": "Alchemy.Random",
  "props": { "bytes": 16 },
  "attr": {
    "text": { "__redacted__": { "__sealed__": "v1.<iv>.<ciphertext>" } },
  },
}
```

A sealed value opens only in the file that it was sealed for. A copy in a different file does not
open.

### How a deploy writes

- The deploy takes the lock of its stage and renews it while it runs. If the deploy stops without a
  release, the lock ends after 60 seconds.
- All the writes that are waiting go into one commit, with a message such as
  `my-app prod: set Worker, Bucket`.
- When another deploy moved the branch first, the store reads the new head and tries again.

### Limits

- Each write is a commit, about 2 seconds.
- Each read asks GitHub for the head of the branch, one API call, and a record that the run did not
  read before is one more. A destroy of 40 resources is about 350 calls. The `GITHUB_TOKEN` of
  GitHub Actions allows 1,000 requests per hour per repository.
- A run always sees its own writes. Just after a write of another run, GitHub can still answer with
  the branch from before that write, and the store cannot see that.
- In a public repository, the state is public, except the sealed secrets.
- A ruleset that requires pull requests on all branches, or a tool that deletes stale branches,
  breaks the store. Keep both branches out of such rules.
- There is no key rotation. A new key cannot open the secrets that the old key sealed.
