# Graphify Fit For Samebase

## Document Control

- Status: Research and controlled trial complete
- Date: 2026-07-31
- Project: [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify)
- Reviewed version: `graphifyy` `0.9.31`, commit
  [`4fe1109`](https://github.com/Graphify-Labs/graphify/commit/4fe11092ccbe9f543608f140c790f68d5d83cae4)

## Decision

Graphify `0.9.31` is not useful enough for the Samebase workflow. The controlled trial failed the
source-recall, ambiguity, file-read reduction, and no-change update checks. It passed only the
temporary-cost, clean-build repeatability, and no-false-direct-edge checks.

The local AST graph found direct imports for one shared contract. It did not map the two flows that
cross generated Convex handles and string table names. Its shortest paths also joined true import
edges into paths that were not runtime flows. Direct `rg` searches and source reads were still
required.

Do not install Graphify, create a Samebase Graphify skill, or add it to `AGENTS.md`, `pnpm dev`, CI,
or the product. Do not use its Codex integration, Git hooks, HTTP MCP server, or shared graph
output. Reconsider it only after a later release can represent generated Convex handles and table
strings, report those uncertain links as ambiguous, and keep exclusions stable during updates.

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
- Deletion handling, atomic writes, and shrink checks show attention to graph damage.
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
API files needed to test handle resolution.

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

## Controlled Trial

### Method

The trial used Samebase commit `a96f8b1652c00e1e5d74f346bd81a4fe9b7d1c00`. Three preparation agents
froze the source maps, adapted the earlier agent-context experiment method, and reviewed the
harness. Two new blind agents then used Graphify before they saw the source map. The requested Luna
model was not available in the sub-agent runtime. The trial used Terra Max, the fastest available
non-Sol option, and did not use Sol.

Graphify dependencies were installed from the reviewed `uv.lock` before the process received any
Samebase source. The lock SHA-256 was
`dfe810a15db872f787ce112b50719a8512ac70311cd86acdd7fc6658ba77155d`. The extraction used the reviewed
`v0.9.31` source commit and the installed command reported version `0.9.31`.

The input was a read-only temporary archive of the tracked Samebase commit. A trial-only
`.graphifyignore` excluded tests, fixtures, snapshots, generated seed content, `research/`, `rfcs/`,
and `archive/`. It kept only `api.js` and `api.d.ts` from the generated Convex API directory to test
the generated-handle boundary. Graphify found 723 code files. The final graph contained nodes from
712 source files, with no test, visual-fixture, research, RFC, or archive source paths.

The extraction ran with restricted network access, provider keys removed, query logging disabled,
`--code-only`, `--no-cluster`, and temporary output. The source copy was read-only. Graphify did not
run an installer, hook, server, product integration, or worktree write. Four AST workers could not
start in the sandbox, so the documented one-worker mode was used.

### Build Results

| Check                    | Result                                                                        |
| ------------------------ | ----------------------------------------------------------------------------- |
| First clean extraction   | 9,819 nodes, 21,630 edges, 11,231,166-byte graph, 17.2 seconds                |
| Second clean extraction  | Same node and edge counts, 17.3 seconds                                       |
| Clean graph SHA-256      | Both runs: `3501fc09bf7e53ce9809951f7a2cb6670bc012d22ef49288677922341a861730` |
| Query time               | 0.91 seconds for a focused contract or schema graph query                     |
| Confidence values        | 21,358 `EXTRACTED`, 272 `INFERRED`, 0 `AMBIGUOUS` edges                       |
| Graphify worktree writes | None                                                                          |

The two clean extractions were byte-for-byte equal. The graph was small and fast enough for
temporary local use.

### Flow Results

The blind agents first used `query`, `path`, and `explain`. They then read only the source files
that Graphify returned.

| Flow                                 | Graph result                                                                                                                                                             | Source reads                | Result                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ---------------------------- |
| `NewAppPage` to provisioning plan    | Found the required files after 13 graph calls, but missed the generated action, mutation, workflow, and table-write links. The table name had no node.                   | 7 files, 11 read operations | Fail                         |
| `createRepositoryContract` consumers | One `explain` call found the action, runtime, MCP HTTP, protocol, and catalog importers. All direct import edges were `EXTRACTED`.                                       | 6 files in 2 read commands  | Pass for file discovery only |
| Schema graph UI to storage           | Found the UI, generated API file, and backend file. It did not find `convexSchemaGraphModel.ts`, the two table nodes, or the hook-to-backend and backend-to-table links. | 2 files, 4 read operations  | Fail for semantic tracing    |

Graphify did not create a false direct `EXTRACTED` edge across a generated Convex handle. However,
it also did not report these missing links as ambiguous. The graph had no `AMBIGUOUS` edges. Its
shortest-path command connected true import edges through shared files such as `_generated/api.js`.
Those paths were structurally valid, but they were not runtime call paths.

The graph reduced direct source inspection only for the schema graph flow. The contract flow still
required reading all six files, and the provisioning flow required seven files. It did not meet the
two-of-three reduction gate.

### No-Change Update Result

The stronger protocol from the earlier Samebase tests also ran one no-change `graphify update`. It
failed repeatability. With the same source and exclusions, the update changed the graph from 9,819
to 12,237 nodes and from 21,630 to 23,849 edges. It added 219 source paths, including Markdown
skills, docs, and specs that the code-only clean extraction had skipped. The update graph SHA-256
changed to `fc8b924c2153c1cd11489552388befd08fdd6e35dbc9698e6d57465a04fa6171`.

This update result makes the upstream instruction to run `graphify update .` after code changes
unsafe for Samebase. The graph can change scope when the source does not change.

### Gate Score

| Gate                                              | Result                                                       |
| ------------------------------------------------- | ------------------------------------------------------------ |
| At least 80 percent source recall for every flow  | Fail: the schema storage flow returned 2 of 3 required files |
| No false direct `EXTRACTED` generated-handle edge | Pass                                                         |
| Ambiguous links reported as ambiguous             | Fail: zero `AMBIGUOUS` edges                                 |
| Fewer direct file reads for at least two flows    | Fail: reduced only 1 of 3                                    |
| Temporary size and speed                          | Pass                                                         |
| Same result on a second clean build               | Pass                                                         |
| Same scope on a no-change update                  | Fail                                                         |

The trial passed three of the six original gates. The added no-change update gate also failed. No
Samebase Graphify skill was created.

## Summary

Graphify has a fast, deterministic clean AST build and useful direct-import discovery. It does not
model Samebase's generated Convex calls or string table access well enough, and its no-change update
changed the graph scope. Samebase should not adopt Graphify `0.9.31` or build a wrapper skill for
it.
