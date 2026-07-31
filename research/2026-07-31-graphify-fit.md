# Graphify Fit For Samebase

## Document Control

- Status: Research complete
- Date: 2026-07-31
- Project: [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify)
- Reviewed version: `graphifyy` `0.9.31`, commit
  [`4fe1109`](https://github.com/Graphify-Labs/graphify/commit/4fe11092ccbe9f543608f140c790f68d5d83cae4)

## Decision

Graphify is useful enough for one controlled Samebase evaluation. It is not ready for normal
Samebase use, product integration, or repo-wide installation.

The useful part is the local, code-only AST graph. It can be an optional discovery aid for
cross-file impact analysis. It must not replace direct source inspection, tests, accepted specs, or
the Samebase agent-context package.

Do not install Graphify's Codex integration, Git hooks, HTTP MCP server, or shared graph output. Do
not add it to `AGENTS.md`, `pnpm dev`, CI, or the product. Revisit this decision only after a
network-disabled, temporary evaluation passes the gates in this note.

## Why It Is Relevant

Samebase has 1,816 tracked files. It includes 1,054 JavaScript or TypeScript source files with about
356,000 lines, and 422 Markdown files. One product change can cross the React app, generated Convex
handles, public function contracts, workflows, provider calls, and stored state.

Managed app creation is one example:

1. [`NewAppPage`](../apps/samebase/src/components/NewAppPage.tsx#L525-L535) calls a generated Convex
   action handle.
2. [`createRepository`](../apps/samebase/convex/vault/actions.ts#L808-L820) applies the shared
   action contract.
3. [`createRepositoryContract`](../apps/samebase/convex/vault/contracts/createRepository.ts#L13-L65)
   defines the app and MCP boundary.
4. The action creates workflow state and starts the provisioning path.

A correct relationship graph could make the first source map faster. This is the one high-value use
case to test.

## What Graphify Does

Graphify converts code and documents into a NetworkX graph. Its documented pipeline is:

`detect -> extract -> build_graph -> cluster -> analyze -> report -> export`

Code extraction uses tree-sitter and does not need an LLM. Document and media extraction can send
content to a configured model. Nodes and edges include a source file. Edges also have an
`EXTRACTED`, `INFERRED`, or `AMBIGUOUS` confidence value.

The main output is a JSON graph. The CLI provides lexical `query`, `path`, `explain`, and `affected`
operations. It can also create an HTML graph and serve read tools through MCP. Query retrieval uses
term scoring and graph traversal. It is not semantic vector search.

Primary sources:

- [Purpose and output files](https://github.com/Graphify-Labs/graphify/blob/v8/README.md#L238-L262)
- [Capabilities](https://github.com/Graphify-Labs/graphify/blob/v8/README.md#L287-L308)
- [Pipeline and module map](https://github.com/Graphify-Labs/graphify/blob/v8/ARCHITECTURE.md#L4-L28)
- [Extraction schema](https://github.com/Graphify-Labs/graphify/blob/v8/ARCHITECTURE.md#L29-L51)
- [Query scoring and traversal](https://github.com/Graphify-Labs/graphify/blob/v8/graphify/serve.py#L258-L500)
- [Package and dependencies](https://github.com/Graphify-Labs/graphify/blob/v8/pyproject.toml#L3-L87)

## Strong Points

- Code extraction is local and deterministic.
- The graph is plain JSON and does not require a graph database.
- Confidence values separate direct source facts from resolved or uncertain links.
- The CLI has focused tools for path, impact, and neighborhood questions.
- Incremental updates, deletion handling, atomic writes, and shrink checks show attention to graph
  damage.
- The test tree has broad language, installer, query, and regression coverage.
- PyPI publication uses OIDC trusted publishing.
- The Apache-2.0 license permits internal and commercial use. Old MIT notices must stay with a
  redistributed copy.

Sources:

- [Incremental write protection](https://github.com/Graphify-Labs/graphify/blob/v8/graphify/cli.py#L2960-L2991)
- [Test suite](https://github.com/Graphify-Labs/graphify/tree/v8/tests)
- [Publish workflow](https://github.com/Graphify-Labs/graphify/blob/v8/.github/workflows/publish.yml)
- [License](https://github.com/Graphify-Labs/graphify/blob/v8/LICENSE)
- [Notice](https://github.com/Graphify-Labs/graphify/blob/v8/NOTICE)

## Risks

### TypeScript Accuracy Is Not Stable Enough

The open backlog includes defects in the exact areas that Samebase needs:

- [`#2340`](https://github.com/Graphify-Labs/graphify/issues/2340): TypeScript monorepo path aliases
  can lose imports.
- [`#2343`](https://github.com/Graphify-Labs/graphify/issues/2343): cross-language stub resolution
  can connect a symbol to the wrong language.
- [`#2323`](https://github.com/Graphify-Labs/graphify/issues/2323): a query can omit edges between
  visited nodes.
- [`#2342`](https://github.com/Graphify-Labs/graphify/issues/2342): an update can change a directed
  graph to an undirected graph.
- [`#2336`](https://github.com/Graphify-Labs/graphify/issues/2336): a hook rebuild can remove
  document nodes.

Recent releases also fixed reversed paths, absolute-path node IDs, arbitrary symbol selection, and
lost or false call edges. The fixes are useful, but they show that graph correctness is still
changing quickly.

Generated Convex handles are the main Samebase fit risk. Graphify must prove that it can connect
`api.vault.actions.createRepository` to its source action without inventing a high-confidence edge.
It must also prove that it can connect string table names to the correct state model.

### The Project Is Young And Changes Very Fast

GitHub API data collected on 2026-07-31 shows:

- The repository was created on 2026-04-03.
- It has 99,431 stars, 9,642 forks, and 334 watchers. This is strong early attention, but it is not
  a long operating record.
- It has 334 open issues and 386 open pull requests.
- It has 177 releases. The current release is `0.9.31`.
- The top contributor has 939 of 1,312 listed contributions, or 71.6 percent.
- A stale `v1.0.0` release is older than the current `0.9.31` line.

The release rate shows fast maintenance. It also makes a normal unpinned install unsafe for a
repeatable Samebase workflow.

Data sources:

- [Repository API](https://api.github.com/repos/Graphify-Labs/graphify)
- [Contributor API](https://api.github.com/repos/Graphify-Labs/graphify/contributors?per_page=100&anon=true)
- [Releases](https://github.com/Graphify-Labs/graphify/releases)
- [`0.9.31`](https://github.com/Graphify-Labs/graphify/releases/tag/v0.9.31)
- [`0.9.30`](https://github.com/Graphify-Labs/graphify/releases/tag/v0.9.30)

### Security And Quality Controls Are Incomplete

The security policy documents useful controls for URL fetches, file paths, HTML labels, prompt
injection, symlinks, and local MCP use. However, its supported-version table still names `0.3.x`
while the package is `0.9.31`. Its network description also does not cover all current semantic and
PR features.

CI tests Python 3.10 and 3.12. Bandit and `pip-audit` are non-blocking. CI does not run the declared
Pyright or Ruff checks, and Pyright is set to basic mode. The main CI job runs on Ubuntu only.

The code makes query logging opt-in. One README privacy paragraph still says that it is on by
default. This documentation conflict does not change the code behavior, but it is another release
quality signal.

Sources:

- [Security policy](https://github.com/Graphify-Labs/graphify/blob/v8/SECURITY.md#L2-L54)
- [CI workflow](https://github.com/Graphify-Labs/graphify/blob/v8/.github/workflows/ci.yml#L45-L98)
- [Query log implementation](https://github.com/Graphify-Labs/graphify/blob/v8/graphify/querylog.py#L13-L31)
- [Conflicting README text](https://github.com/Graphify-Labs/graphify/blob/v8/README.md#L520-L541)

### The Default Codex Install Conflicts With Samebase

`graphify codex install` adds an always-loaded section to `AGENTS.md`. That section tells the agent
to query Graphify before direct source reads and to run `graphify update .` after code changes. The
installer also adds a Codex hook that is intentionally a no-op because Codex does not accept its
added context format.

This is not safe for Samebase:

- Samebase has an explicit source authority order. A generic graph does not know whether a document
  is an accepted spec, an RFC, research, or archive material.
- The [agent context bundle](../packages/agent-context/manifests/samebase.md#trigger-map) already
  separates core rules, task skills, and Samebase overlays.
- `AGENTS.md` is 30,263 bytes. The [budget check](../scripts/check-agents-doc-budget.ts#L22-L26)
  fails above 31,000 bytes. Graphify's injected block is 1,129 bytes, so the combined root file
  would fail the budget check.
- Automatic graph updates would add a new required step to every code change before the graph has
  proved its value.

Sources:

- [Codex install behavior](https://github.com/Graphify-Labs/graphify/blob/v8/graphify/install.py#L1336-L1407)
- [Injected `AGENTS.md` block](https://github.com/Graphify-Labs/graphify/blob/v8/graphify/always_on/agents-md.md#L1-L11)

### Published Benchmarks Are Not An Adoption Gate

The memory tests are more detailed than the code test. The published code-intelligence result uses
six questions on ERPNext. The harness and results are from the Graphify project. They are useful as
a lead, but they do not prove TypeScript and Convex accuracy on Samebase.

Source:
[benchmark method and results](https://github.com/Graphify-Labs/graphify/blob/v8/BENCHMARKS.md#L23-L89)

## Samebase Fit

### Good Fit

- Early source mapping for changes that cross the React app, Convex, workflows, and MCP contracts.
- Reverse impact checks for a shared contract, action, or state model.
- A second view of code communities when direct `rg` results are too broad.
- A check against the current agent-context modularization map.

### Bad Fit

- A replacement for code, tests, or accepted specs.
- A source of product intent.
- A shared production service or user-facing graph feature.
- A security, auth, schema, or migration authority.
- A full graph of `research/`, `rfcs/`, `archive/`, fixtures, snapshots, and generated files.
- A replacement for the existing Samebase Convex schema graph.

Samebase already has a domain-specific schema graph with declared and inferred provenance in
[`convexSchemaGraphModel.ts`](../apps/samebase/convex/vault/convexSchemaGraphModel.ts#L1-L90). It
also has a shipped graph UI in
[`VaultConvexSchemaGraph.tsx`](../apps/samebase/src/components/vault-dashboard/VaultConvexSchemaGraph.tsx#L1-L40).
Graphify's generic source graph is not a replacement for this product model.

## Controlled Evaluation

The evaluation must use a reviewed and pinned Graphify version. It must run in a temporary,
network-disabled environment with read-only Samebase source input. It must not run any Graphify
installer or hook. It must not write into the worktree.

Use code-only extraction for production TypeScript. Exclude tests, visual fixtures, snapshots,
`research/`, `rfcs/`, `archive/`, and generated output. Include only the minimum generated Convex
type file needed to test handle resolution.

Test these three maps:

1. `NewAppPage` to `workflow_vaultProvisioning_plans`.
2. `createRepositoryContract` to the app action and MCP runtime consumers.
3. `VaultConvexSchemaGraph` UI calls to the snapshot and layout tables in
   `convexSchemaGraphModel.ts`.

For each map, compare Graphify with an `rg` source map and direct file reads.

Pass only when all gates are true:

- Graphify finds at least 80 percent of the known production files for each map.
- It does not invent an `EXTRACTED` edge across a generated Convex handle.
- It reports ambiguous links as ambiguous.
- It reduces direct file reads for at least two of the three maps.
- The graph and update output stay small enough for temporary local use.
- A second run on the same commit gives the same material result.

If the evaluation passes, create a small Samebase-owned research skill that runs the pinned tool in
temporary storage. Keep direct source validation mandatory. Do not adopt the upstream installer,
hooks, committed graph output, HTTP MCP mode, or product UI.

## Experiment Status

No Graphify code ran against the Samebase worktree during this research. The planned code-only trial
was stopped before execution because dependency download access and private repository read access
would have been active in the same unverified third-party process. The safety boundary was not
weakened. No Graphify output was created in the repository.

## Summary

Graphify has a relevant idea and a useful local AST core. Samebase should test that core only as a
temporary discovery aid. Current TypeScript correctness issues, release churn, concentrated
maintenance, stale security documentation, and an incompatible Codex installer make normal adoption
too risky now.
