# 093 Agent Action Docs Registry Plan

## Document Control

- Status: Proposed
- Owner: Samebase platform, MCP/action surfaces, public developer artifacts
- Created: 2026-07-06
- Last updated: 2026-07-06
- Related docs:
  - `docs/repo-documentation-standard.md`
  - `docs/artifacts/samebase-app/README.md`
  - `docs/tracked-file-paths.md`
  - `packages/agent-context/manifests/samebase.md`
  - `research/2026-05-23-agent-context-packaging-decision.md`
  - `research/2026-06-11-agents-md-truncation-audit.md`
  - `rfcs/030_MONOREPO_TYPESCRIPT_RUNTIME_AND_PORTABILITY_SPEC.md`
  - `rfcs/089_MCP_CONVEX_FUNCTION_EXPOSURE_SPEC.md`
  - `specs/005_STARTER_TEMPLATE_STRATEGY_SPEC.md`
- External reference:
  - `https://github.com/BuilderIO/agent-native`

## Summary

Samebase should make action-facing documentation a canonical monorepo artifact, then publish that
artifact into multiple surfaces:

1. raw public files for agents and humans that do not have monorepo access,
2. MCP resources for connected agent clients,
3. in-product UI documentation for human operators, and
4. optional local/package search tooling for version-matched agent context.

The public raw-file repository is useful, but it should be a generated distribution target, not the
editable source of truth. The source of truth should be a Samebase-owned action-docs registry with a
manifest, validation, provenance, and generated exports.

## Problem

Samebase is adding UI and MCP surfaces that let humans and agents connect providers and run product
actions. Those surfaces need durable explanations for why the action works the way it does, which
provider limitations it works around, what credentials or scopes it needs, and which automation is
safe to run.

The immediate example is the Cloudflare Workers Builds variable gap: the Builds API supports
separate production and preview trigger variables, while the dashboard setup path exposes only a
generic build variables/secrets area. Samebase's generated app and provisioning flow compensate with
repo-owned scripts and a `CONVEX_DEPLOY_KEY` / `PREVIEW_CONVEX_DEPLOY_KEY` contract. That
explanation needs to be available to:

1. people reading Samebase docs,
2. agents operating through Samebase MCP,
3. generated-app maintainers reading raw files, and
4. Samebase maintainers changing the action or template later.

Duplicating this prose separately in UI copy, MCP tool descriptions, generated templates, and a
public docs repository would drift. Adding more long-form guidance to `AGENTS.md` is also the wrong
shape because the repo already has explicit budget pressure around always-loaded agent docs.

## Prior Art In This Repo

Samebase already has the mechanics needed for a first version.

Tracked file selection:

- `scripts/generate-tracked-file-paths.ts` reads tracked files through `git ls-files -z --cached`,
  rejects unsafe paths, and generates a typed path union.
- `scripts/lib/trackedFilePath.ts` gives scripts a checked vocabulary for hard-coded repo file
  references.
- `docs/tracked-file-paths.md` documents that generated tracked-file output is a typechecking aid
  and that scripts should use the wrapper instead of unvalidated string paths.

Generated manifest export:

- `scripts/export-samebase-app-manifest.ts` exports a deterministic file manifest with provenance,
  commit metadata, file modes, binary/text split, and content hash.
- `apps/samebase/convex/starterSeed.ts` turns a manifest into deterministic GitHub tree entries,
  creates binary blobs, creates a root commit, and updates or creates a branch ref.
- `specs/005_STARTER_TEMPLATE_STRATEGY_SPEC.md` establishes that `samebase/app` is the source for
  the starter template and Samebase stores a generated manifest for runtime app creation.

Public artifact doctrine:

- `docs/artifacts/samebase-app/README.md` treats `samebase/app` as a clean public teaching artifact.
  Messy regeneration instructions, prompts, and decision notes stay in Samebase.
- The same rule should apply to public action docs: the public repo should look deliberately
  published, not like a copy of every internal note that helped create it.

Agent context packaging:

- `packages/agent-context` already packages core context, skills, overlays, and manifests.
- `research/2026-05-23-agent-context-packaging-decision.md` chose a context bundle instead of flat
  skill promotion.
- `packages/agent-context/manifests/samebase.md` is the current package-local routing precedent.

Always-loaded doc pressure:

- `scripts/check-agents-doc-budget.ts` guards the combined `AGENTS.md` budget.
- `research/2026-06-11-agents-md-truncation-audit.md` records the failure mode: Codex silently drops
  tail content past the configured project-doc cap, so long-lived agent guidance belongs in docs,
  skills, packages, or generated manifests with a compact router.

MCP/action shape:

- `apps/samebase/convex/mcp/http.ts` currently advertises tool capabilities and handles `tools/list`
  / `tools/call`.
- It does not expose MCP resources yet.
- `rfcs/089_MCP_CONVEX_FUNCTION_EXPOSURE_SPEC.md` moves Samebase toward function-level MCP opt-in,
  where app-owned function contracts provide access, args, returns, and presentation metadata.
  Action docs should align with that direction instead of creating a permanent parallel catalog.

## External Prior Art

BuilderIO's `agent-native` points to a useful product shape but should not be copied wholesale.

Useful ideas to borrow:

1. Actions are first-class contracts that project into UI, agent, HTTP, MCP, CLI, and other
   surfaces.
2. Documentation is bundled with the package, not only hosted as a web site.
3. Agents can search version-matched local docs and examples.
4. Manifests describe docs roots, installable skills, app packages, MCP connectors, and UI surfaces.
5. Raw portable skills are useful but incomplete when they do not carry MCP setup and app context.

Samebase does not need to adopt `agent-native` as a framework. The relevant principle is one action
contract with several projections. Samebase already has Convex functions, access keys, MCP OAuth,
provider connections, and generated artifact machinery; the action-docs registry should extend those
native structures.

## Goals

1. Keep action docs canonical inside the Samebase monorepo.
2. Publish the same source into raw public files, MCP resources, and UI docs.
3. Make public exports deterministic, reviewable, and provenance-stamped.
4. Keep action docs tied to the product action or provider workflow they explain.
5. Validate that referenced source files, MCP tool names, and action ids stay current.
6. Keep sensitive provider credentials, internal-only notes, and temporary research out of public
   exports by default.
7. Preserve the benefits of the monorepo while giving external agents a simple raw-file path.

## Non-Goals

1. Creating a public docs repo as the editable source of truth.
2. Moving all Samebase docs into a publishable package.
3. Replacing `docs/`, `specs/`, `rfcs/`, `research/`, or `packages/agent-context`.
4. Auto-exposing every Convex function as an agent action.
5. Turning MCP tool descriptions into long-form documentation.
6. Solving a full public docs web site in the first implementation.
7. Publishing private operational runbooks, credentials, audit data, or user-specific provider
   state.

## Proposed Shape

Add a focused monorepo package:

```text
packages/action-docs/
  package.json
  actions/
    cloudflare-workers-build-variables.md
    samebase-app-provisioning.md
  manifests/
    samebase.md
  schemas/
    action-doc.schema.json
  src/
    index.ts
```

Use `packages/action-docs`, not `packages/docs`. The package is not all documentation. It owns the
subset that is meant to become action-facing, agent-readable, exported, and validated.

Durable internal docs remain in `docs/`. Product behavior still graduates into `specs/` after
acceptance. Exploratory evidence stays in `research/`. The action-doc package can reference those
files, but it should not absorb every internal document.

Each action doc is Markdown with frontmatter:

```yaml
---
id: cloudflare.workers.buildVariables
title: Cloudflare Workers build variables
status: draft
public: true
mcpResources:
  - samebase://docs/actions/cloudflare.workers.buildVariables
relatedMcpTools:
  - vault_actions_createRepository
relatedSourcePaths:
  - apps/samebase/convex/vault/createRepositoryContract.ts
  - docs/artifacts/samebase-app/README.md
effects:
  - provider_configuration
providers:
  - cloudflare
  - convex
safety: write_setup
---
```

The body explains the durable contract in product language:

1. what the action or workflow does,
2. why it exists,
3. what provider limitation or product invariant shaped it,
4. which credentials or scopes are required,
5. what the automation writes,
6. what the operator or agent should verify, and
7. where the source code and generated artifact live.

The package exports a generated manifest:

```ts
export const actionDocsManifest = {
  version: 1,
  sourceCommit: "...",
  contentHash: "...",
  generatedAt: "...",
  docs: [
    {
      id: "cloudflare.workers.buildVariables",
      title: "Cloudflare Workers build variables",
      sourcePath: "packages/action-docs/actions/cloudflare-workers-build-variables.md",
      publicPath: "actions/cloudflare-workers-build-variables.md",
      mcpResources: ["samebase://docs/actions/cloudflare.workers.buildVariables"],
      relatedMcpTools: ["vault_actions_createRepository"],
      relatedSourcePaths: [
        "apps/samebase/convex/vault/createRepositoryContract.ts",
        "docs/artifacts/samebase-app/README.md",
      ],
      contentHash: "...",
    },
  ],
} as const;
```

## Validation

Add a validation script before publishing anything:

1. Parse Markdown frontmatter with a real parser, not ad hoc string slicing.
2. Validate every document against `action-doc.schema.json`.
3. Enforce unique `id` values and stable URI-safe ids.
4. Enforce that every `relatedSourcePaths` entry exists through `trackedFilePath(...)` or generated
   tracked-file membership.
5. Enforce that every public document has an export path and no duplicate export path.
6. Check that referenced MCP tool names exist in the generated or hand-maintained MCP catalog for
   the current implementation stage.
7. Reject documents that mark `public: true` while referencing internal-only files.
8. Generate a manifest with deterministic path ordering and content hashes.

This should be a hard check for the package:

```sh
pnpm --filter @samebase/action-docs check
```

The package can later add docs search, markdown export, and MCP resource generation without changing
the source contract.

## Public Raw-File Export

The public raw-file repo should be a generated output from the package manifest.

The export should:

1. copy only `public: true` files,
2. write a generated `README.md`,
3. write a machine-readable `manifest.json`,
4. include `sourceRepository`, `sourceCommit`, `sourceBranch`, and `contentHash`,
5. preserve deterministic ordering,
6. fail if generated output differs from committed output in CI, and
7. publish through a bot branch or bot PR to the public repository.

The public repository should include a clear note:

```md
This repository is generated from samebase/samebase. Changes should be made in the source repo.
```

Do not allow public-repo edits to become the canonical path. Pulling arbitrary public edits back
into Samebase would weaken the provenance model and invite drift.

## MCP Projection

Add MCP resources after the package manifest exists.

The first resource methods should be:

1. `resources/list`: list public action-doc resources the connected user may read.
2. `resources/read`: return the Markdown content and metadata for a selected resource URI.

Resource URIs should be stable and product-owned:

```text
samebase://docs/actions/cloudflare.workers.buildVariables
```

For public docs, the resource can be available to any authorized Samebase MCP user. For future
account-specific docs, resource listing must respect the same access model as tools.

MCP tool descriptions should remain concise. They can point to a resource URI, but they should not
embed the full action doc.

## UI Projection

The UI should render the same manifest and Markdown content rather than owning separate explanatory
copy.

First useful placement:

1. provider connection/setup screens,
2. app provisioning repair actions,
3. generated app/template pages, and
4. MCP action consent or action-details surfaces.

The UI can use shorter excerpts, but the excerpt should be generated from or linked to the same
source document. If a human needs more context, they should land on the full action doc.

## Relationship To `packages/agent-context`

`packages/agent-context` is a context bundle for how agents should work in this repo.
`packages/action-docs` is a product/action documentation bundle for how Samebase actions work.

They may link to each other, but they should not merge:

- agent context explains agent operating behavior,
- action docs explain product actions, provider constraints, and public automation contracts.

This separation keeps future public action docs from inheriting operator-only workflow rules.

## Security And Privacy

Action docs are public by default only when explicitly marked `public: true`.

The exporter must reject or require manual review for documents that reference:

1. secrets, tokens, deploy keys, or credential values,
2. customer/user identifiers,
3. private provider account ids,
4. production-only incident details,
5. internal-only runbooks,
6. unreleased provider workarounds that should not be public yet, or
7. paths outside the allowlisted docs/action-docs/source-code set.

Provider-specific docs should explain permission classes and safe setup shapes, not concrete secret
values.

## Phases

### Phase 0 - RFC acceptance

Decide whether `packages/action-docs` is the right source location. If accepted, extract the stable
contract from this RFC into a spec before implementation starts.

### Phase 1 - Source package and first docs

Create `packages/action-docs` with:

1. the schema,
2. a small manifest,
3. validation,
4. one or two seed documents.

The first seed document should cover Cloudflare Workers Builds variables and the Samebase generated
app deploy-key contract.

### Phase 2 - Manifest export

Add a deterministic exporter modeled after `scripts/export-samebase-app-manifest.ts`.

The output should be usable by:

1. MCP resource handlers,
2. UI rendering,
3. public raw-file publishing, and
4. package-local docs search later.

### Phase 3 - MCP resources

Extend the Samebase MCP server from tools-only to tools plus docs resources.

Do not mix long-form docs into `tools/list`. Use resource URIs and `resources/read`.

### Phase 4 - UI rendering

Render action docs or excerpts in setup/repair surfaces.

Keep UI copy compact. Use the full document as the durable explanation.

### Phase 5 - Public repo publishing

Add CI that publishes the curated public subset to a public repository by bot PR or bot branch.

The public repo is an output. Samebase remains source of truth.

### Phase 6 - Local search and installable context

Consider adding package-local search, `llms.txt`, or installable agent context only after the
manifest and first public/MCP surfaces prove useful.

## Spec Extraction Target

If this RFC is accepted, the follow-up spec should define:

1. the package name and directory layout,
2. the action-doc frontmatter schema,
3. the validation script behavior,
4. the generated manifest shape,
5. the public export contract,
6. the MCP resource URI and response shape,
7. the first seed documents, and
8. the CI gates required before publishing.

The spec should not repeat the full research narrative. It should capture the accepted contract that
implementers and agents must follow.

## Open Questions

1. Should the first public raw-file target be a new repo such as `samebase/docs`, or should it land
   in an existing public artifact repo first?
2. Should public publishing use direct bot pushes, bot PRs, or both depending on branch protection?
3. Should action docs be Markdown only in v1, or should Samebase allow MDX and export plain Markdown
   mirrors later?
4. Should `relatedMcpTools` validate against the current hand-maintained MCP tool catalog first, or
   wait until the function-level MCP opt-in from `rfcs/089` is implemented?
5. Should public action docs include an `llms.txt` entry immediately, or wait until there are enough
   docs to justify a discovery file?

## Decision Bias

Start with the source package and validation, not the public repo. The raw-file repo becomes useful
only when the source artifact is stable enough to publish without manual curation.

The one invariant to preserve is single-source projection: one action-doc source, many surfaces.
