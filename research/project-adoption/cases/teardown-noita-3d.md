# Teardown Noita 3D

## Outcome

[Teardown Noita 3D pull request 11](https://github.com/nicu-chiciuc/teardown-noita-3d/pull/11) moves
the browser game to the portable Samebase repository contract. Samebase now joins the repository to
the `teardown-noita-3d` Worker at root `/`, with separate production and preview GitHub Builds
triggers.

The reviewed branch build now succeeds. It installs Node 24 and pnpm 11, builds and verifies the
static app, and uploads a non-production Worker version. The Preview gate is not complete. The new
Worker has no active deployment, and both Cloudflare-generated version URLs return 404 with
error 1042. No domain, route, existing deployment, or traffic changed.

The earlier standalone [manual preview Worker](https://teardown-noita-3d-preview.pfp.workers.dev)
remains reachable. It is a useful provider spike, but it is not evidence for the Samebase
repository-backed path.

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
5. Provider-native reads then found zero active deployments and unreachable generated preview URLs.
   A successful build and version record therefore did not pass Preview.

## Bidirectional results

### Target only

- align Node, pnpm, Vite+, TypeScript, CI, and deploy commands
- generate fixtures and verify every provider asset
- keep the web-sized heightmap in ordinary Git
- rebuild and compare the checked-in WASM in GitHub CI
- give the slow WebGPU browser test the same timeout as the other Rust tests

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

### Intentionally different

Convex, authentication, and server code remain not applicable because this application has no
durable-data or identity responsibility. Cargo remains the Rust compiler, and Playwright remains the
browser and GPU test owner.

### Deferred

- a reachable preview for the Samebase-connected Worker
- the first active deployment and any production observation
- removal of the standalone manual Worker, which needs a separate destructive request

## Evidence policy

Keep provider IDs, full logs, browser traces, and the full gate record in task-local storage. This
case keeps only the decisions, failures, public links, and reusable rules.
