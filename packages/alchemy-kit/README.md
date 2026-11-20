# @samebase/alchemy-kit

[![npm](https://img.shields.io/npm/v/@samebase/alchemy-kit)](https://www.npmjs.com/package/@samebase/alchemy-kit)
[![license](https://img.shields.io/npm/l/@samebase/alchemy-kit)](https://github.com/samebase/samebase/blob/main/packages/alchemy-kit/LICENSE)

Parts for [Alchemy v2](https://alchemy.run). Each part is its own entry, so your stack loads only
the part that it imports.

| Part                                      | Entry                                | What it is                                                                 |
| ----------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| [GitHub state store](#github-state-store) | `@samebase/alchemy-kit/github-state` | The state of a stack on a branch of its GitHub repository, secrets sealed. |
| [Run record](#run-record)                 | `@samebase/alchemy-kit/run-record`   | A record of the run in each stage output, over any state layer.            |

> The source is in
> [`packages/alchemy-kit`](https://github.com/samebase/samebase/tree/main/packages/alchemy-kit) of
> the Samebase monorepo. Use [GitHub Issues](https://github.com/samebase/samebase/issues) to report
> a problem or request a change.

## GitHub state store

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/samebase/samebase/main/packages/alchemy-kit/docs/github-state-dark.svg">
  <img src="https://raw.githubusercontent.com/samebase/samebase/main/packages/alchemy-kit/docs/github-state-light.svg" alt="A deploy, on your laptop or in GitHub Actions, holds the passphrase ALCHEMY_STATE_PASSPHRASE and seals each secret before it leaves the run. In your GitHub repository, the deploy takes the lock on the branch alchemy-state-store-lock, then reads and commits the state on the branch alchemy-state-store: one JSON file for each resource. The branch main holds your code and alchemy.run.ts." width="100%">
</picture>

Alchemy keeps a record of each resource that it deployed. This store keeps that record on a branch
of the repository that the stack deploys from. The state needs no cloud account and no server: the
repository and its `GITHUB_TOKEN` are enough.

- **One JSON file for each resource.** You read the state on github.com, and each deploy is a commit
  that names what it changed.
- **Sealed secrets.** Alchemy's state encryption seals each secret with AES-256-GCM before it leaves
  the run. The passphrase is a repository secret.
- **One deploy of a stage at a time.** A second deploy of the same stage fails at once.

### Quick start

**1. Install.**

```sh
pnpm add -D @samebase/alchemy-kit alchemy@https://pkg.alchemy.run/alchemy/pr:3167:61500d4 effect
```

**2. Give the store to your stack**, in `alchemy.run.ts`. The store needs a state encryption:

```ts
import * as GitHubState from "@samebase/alchemy-kit/github-state";
import * as Alchemy from "alchemy";
import { passphraseEncryption } from "alchemy/State/PassphraseEncryption";
import * as Layer from "effect/Layer";

export default Alchemy.Stack(
  "my-app",
  {
    providers,
    state: GitHubState.state().pipe(Layer.provide(passphraseEncryption()), Layer.orDie),
  },
  program,
);
```

**3. Make the passphrase**, once, and keep it as a repository secret:

```sh
openssl rand -base64 32 | gh secret set ALCHEMY_STATE_PASSPHRASE
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
          ALCHEMY_STATE_PASSPHRASE: ${{ secrets.ALCHEMY_STATE_PASSPHRASE }}
```

The first deploy makes the two branches.

### Options

`GitHubState.state()` takes one object. Each field is optional.

| Option       | Default                                       | What it is                                                   |
| ------------ | --------------------------------------------- | ------------------------------------------------------------ |
| `repository` | `GITHUB_REPOSITORY`, else the `origin` remote | The repository, as `owner/name`.                             |
| `branch`     | `alchemy-state-store`                         | The state branch. The lock branch is this name with `-lock`. |

The token is `GITHUB_TOKEN`, else `GH_TOKEN`.

### The passphrase

Alchemy's state encryption seals the secrets
([alchemy-run/alchemy#3167](https://github.com/alchemy-run/alchemy/pull/3167)). Each deploy of the
repository uses the same passphrase.

- Without the passphrase, the store stops before it reads or writes anything.
- With a different passphrase, the store stops at the first file with a secret.
- If you lose the passphrase, you cannot open the secrets on the branch.

### From your laptop

The store reads the token from the environment of the process. A `.env` file does not set it. Keep
the passphrase in a file that git ignores, here `.state-passphrase`.

```sh
export GITHUB_TOKEN="$(gh auth token)"
export ALCHEMY_STATE_PASSPHRASE="$(cat .state-passphrase)"
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
except its secrets. A file with a secret starts with one line that names the encryption and holds
the wrapped data key of its stage. This is `my-app/prod/ApiKey.json`, shortened:

```
alchemy:sealed:1:passphrase:<wrapped data key>
{
  "status": "created",
  "resourceType": "Alchemy.Random",
  "props": { "bytes": 16 },
  "attr": {
    "text": { "__sealed__": "<iv, ciphertext, and tag>" }
  }
}
```

A sealed value opens only in the stack and stage that it was sealed for. A copy in a different file
of the same stage opens.

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
- There is no passphrase rotation. A new passphrase cannot open the secrets that the old one sealed.
- The store refuses a file with secrets that `@samebase/alchemy-kit` 0.3 or older sealed. Destroy
  the stage with that version, then deploy again.

## Run record

Alchemy state holds no time, commit, branch, or run. `withRunRecord` adds them to each stage output
that the state writes, under the key `samebase.run`:

```json
{
  "url": "https://my-app.example.workers.dev",
  "samebase.run": {
    "version": 1,
    "repository": "my-org/my-app",
    "stackFile": "alchemy.run.ts",
    "branch": "feature",
    "pullRequest": 42,
    "headCommit": "8af3c5b7932c528939cbc7aa0597b1fc36c8dc83",
    "runUrl": "https://github.com/my-org/my-app/actions/runs/12345678901/attempts/1",
    "source": "github-actions",
    "recordedAt": "2026-10-21T10:00:00.000Z"
  }
}
```

Put it over the state layer of your stack, in `alchemy.run.ts`:

```ts
import * as GitHubState from "@samebase/alchemy-kit/github-state";
import { withRunRecord } from "@samebase/alchemy-kit/run-record";
import * as Alchemy from "alchemy";
import { passphraseEncryption } from "alchemy/State/PassphraseEncryption";
import * as Layer from "effect/Layer";

export default Alchemy.Stack(
  "my-app",
  {
    providers,
    state: withRunRecord(
      GitHubState.state().pipe(Layer.provide(passphraseEncryption()), Layer.orDie),
    ),
  },
  program,
);
```

It works over any state layer, such as the Cloudflare state store of Alchemy. Every other call goes
to that layer as it is.

- **Where the values come from.** On GitHub Actions, from the variables of the run and the event
  payload: on a pull request, the head branch and the head commit. Else from git in the checkout,
  which needs a branch and an `origin` remote with `owner/name`. `source` says which.
- **The stack file** is the working directory of the run, from the repository root, plus
  `alchemy.run.ts`.
- **A checkout that gives no record still deploys.** A tarball without git, a checkout without
  `origin`, or a detached HEAD still reads, plans, and destroys. Its outputs are written without the
  record, and the log says why.
- **An output with no place for the key**, such as a string, an array, or a Date, is stored as it
  is, with a warning in the log. A value that the stack itself put under the key stays.
- Alchemy writes the output only after a full successful apply, so the record names the last full
  successful deploy of the stage. It holds no secret.
