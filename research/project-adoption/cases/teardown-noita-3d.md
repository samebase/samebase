# Teardown Noita 3D

## Outcome

[Teardown Noita 3D pull request 11](https://github.com/nicu-chiciuc/teardown-noita-3d/pull/11) moved
the browser game to the portable Samebase repository contract. Samebase now joins the repository to
the `teardown-noita-3d` Worker at root `/`, with separate production and preview GitHub Builds
triggers.

After the pull request was merged, the first default-branch build deployed Worker version `599266c1`
and made [the application](https://teardown-noita-3d.pfp.workers.dev) reachable. The later
[preview probe pull request 12](https://github.com/nicu-chiciuc/teardown-noita-3d/pull/12) uploaded
version `5a0f10f9`. Its [version URL](https://5a0f10f9-teardown-noita-3d.pfp.workers.dev) and
[branch alias](https://codex-verify-preview-after-main-teardown-noita-3d.pfp.workers.dev) both
returned the built application. The active production deployment stayed on version `599266c1`.

The earlier standalone manual preview Worker was a useful provider spike, but it was not evidence
for the Samebase repository-backed path. It was removed after this evidence was preserved.

## Starting shape

- npm workspace with Node 24 application intent but Node 20 CI
- React and Vite+ client with Rust-to-WASM simulation and Playwright browser tests
- Node automation outside the typecheck
- provider build that depended on generated WASM and a large Git LFS heightmap
- no authentication, server endpoint, private data, durable remote data, or production host

## What the manager got wrong

The manager first accepted the standalone Worker as a passed preview. It did not require a Samebase
Worker join, both GitHub Builds triggers, or a successful provider build for the reviewed branch. It
also treated a pull request as if it were a production change and trusted the first task record
after later evidence had made that record false.

The repository also required SSH through one local credential agent. This blocked a normal push and
distracted the run from the provider contract. The repair used the active GitHub CLI account over
HTTPS and left authentication ownership with the execution environment.

The manager also treated broad regression coverage as part of adoption success without first
agreeing on its cost or value with the operator. The application's Rust and WebGPU complexity did
not make it an important production service. The operator wanted strong lint and type checks, but
did not want to spend several minutes on broad gameplay and device tests for every change.

## Browser handoff

The Samebase MCP did not expose the exact create-Worker action at the time of the run. The operator
required the manager to use the authenticated Samebase browser handoff. The in-app Browser then used
the same account and Samebase UI as the operator to create and connect the Worker.

This is the correct fallback. The manager must verify the active Samebase session and provider
account, complete only the missing Samebase action in the browser, and reread inventory. It must not
replace the action with a manual provider-only workflow.

## Failed-build repair loop

1. Samebase created both triggers and started a default-branch build. The unchanged default branch
   did not yet contain the pnpm contract, so this build failed before deployment.
2. The first reviewed branch build installed pnpm correctly, but failed because Cloudflare Workers
   Builds does not provide Cargo.
3. The target committed the 30 KB WASM artifact. GitHub CI rebuilds it with pinned Rust and rejects
   any byte difference. Cloudflare consumes and verifies the reviewed artifact with its supported
   Node and pnpm tools.
4. The next provider branch build succeeded and uploaded the reviewed version.
5. At that time, provider-native reads found zero active deployments and unreachable generated
   preview URLs. A successful build and version record therefore did not pass Preview.

## Validation budget correction

The first successful repository CI run showed that Rust and WASM were not the main cost. The
[workflow run](https://github.com/nicu-chiciuc/teardown-noita-3d/actions/runs/30905166331) spent
about two seconds on the WASM artifact check, nine seconds on the application build, and six minutes
and eight seconds on Playwright. The full job took about seven minutes and twenty-three seconds.

The adoption made the full Playwright suite a required pull request gate. Several WebGPU, gameplay,
and touch tests allowed up to two minutes each. That was a testing-maturity decision, not a
necessary Samebase stack decision, and the manager did not ask the operator to approve it.

The correction keeps fast static checks, the build, and WASM artifact verification as required
evidence. It reduces the browser requirement to one short application smoke test. Broader gameplay,
device, and stress coverage can return when the operator decides that the project needs that
assurance.

## First-deployment preview experiment

Before the Worker had an active deployment, the reviewed preview upload succeeded, but its version
URL and branch alias returned 404 with Cloudflare error 1042. After pull request 11 was merged, the
default-branch build used the same source tree, created the first active deployment, and made the
production URL reachable.

The earlier preview URLs then returned 200 without another upload of that preview version. Pull
request 12 supplied a new documentation-only commit and a fresh preview build. Its version URL,
branch alias, JavaScript, CSS, WASM, VOX, and PNG assets all returned 200. Provider-native reads
still showed one active deployment, version `599266c1` from the merged main commit.

This is one assets-only Worker observation. It suggests that the first active deployment made the
Worker service routes available to preview versions and aliases. It does not prove a general
Cloudflare requirement or cause. A manager must keep Preview blocked when a version URL is not
reachable. It must not start an active deployment only to repair Preview without explicit approval.

## Bidirectional results

### Target only

- align Node, pnpm, Vite+, TypeScript, CI, and deploy commands
- keep the web-sized heightmap in ordinary Git
- rebuild and compare the checked-in WASM in GitHub CI
- keep fast static checks, the build, WASM artifact verification, and one short browser smoke test
  as the required gate

### Samebase

- require a Samebase Worker join and both GitHub Builds triggers as explicit adoption gates
- use inventory before and after writes, then provider-native reads for terminal evidence
- use authenticated MCP-to-browser handoff when an action is available only in the Samebase UI
- show whether a new Worker has an active deployment and whether its generated preview URLs are
  reachable
- define the first-deployment sequence for a new Worker whose default branch does not yet contain
  the reviewed deploy contract

### Shared

Two different projects now support these rules:

- complete the full manager preflight before implementation and repeat it after integration
- bind provider evidence to the reviewed commit and keep build, upload, deployment, and route as
  separate facts

A failed repository check or provider build for the reviewed branch blocks Preview. Read native
logs, repair the repository or trigger, push a new commit, and wait for new terminal evidence.

### Candidate

Teardown Noita 3D supports these rules once. Test them on the next adoption before promotion:

- run the exact install, build, production deploy dry-run, and preview deploy dry-run commands from
  the commit that the provider will build before trigger setup
- verify the active Samebase session and provider account, then use authenticated browser handoff
  when MCP lacks the exact Samebase action
- when a new Worker has no active deployment and a successful preview upload returns error 1042,
  record the state as a first-deployment preview candidate; after an approved first deployment, test
  old and new preview URLs and confirm that production did not move to the preview version

### Intentionally different

Convex, authentication, and server code remain not applicable because this application has no
durable-data or identity responsibility. Cargo remains the Rust compiler, and Playwright remains the
browser and GPU test owner.

### Deferred

- independent-project validation of the first-deployment preview candidate
- production observation beyond the successful first deployment and route checks
- broader gameplay, device, and stress coverage until the operator needs that assurance

## Experiment closure

Pull request 12 passed repository CI, its Samebase-connected Worker build, and review before merge.
The experiment branch and the obsolete adoption branch were removed. The standalone manual Worker
was also removed. The connected `teardown-noita-3d` Worker and its active production deployment were
not changed.

The successful repository-backed preview evidence remains in this case and the merged pull request.
The first-deployment behavior remains a one-case candidate until another project tests it.

## Evidence policy

Keep provider IDs, full logs, browser traces, and the full gate record in task-local storage. This
case keeps only the decisions, failures, public links, and reusable rules.
