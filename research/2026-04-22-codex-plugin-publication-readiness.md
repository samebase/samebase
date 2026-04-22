# Codex Plugin Publication Readiness Research

Date: 2026-04-22

## Why This Document Exists

This memo answers two practical questions for Noter:

1. What does the current Codex plugin system require to package and distribute a
   plugin?
2. What is still missing in this repository before Noter could publish one?

This is operational research, not legal advice.

## Why This Lives In `research/`

This document captures current official docs plus a repo-state audit. It is not
yet a product spec, implementation plan, or accepted rollout contract, so it
belongs in `research/`.

## Bottom Line

As of April 22, 2026, Codex supports plugin packaging and installation through:

- the curated Plugin Directory in the Codex app
- repo marketplaces at `$REPO_ROOT/.agents/plugins/marketplace.json`
- personal marketplaces at `~/.agents/plugins/marketplace.json`

Codex also supports plugin packages that bundle:

- a required `.codex-plugin/plugin.json` manifest
- optional `skills/`
- optional `.app.json`
- optional `.mcp.json`
- optional `assets/`

The main blocker is external, not internal:

- OpenAI's official Codex docs still say that adding plugins to the public
  Plugin Directory is "coming soon"
- the same docs also say self-serve plugin publishing and management are
  "coming soon"

So Noter can prepare a plugin package now and distribute it through a local,
personal, repo, or git-backed marketplace, but it cannot complete a self-serve
submission into the official public Plugin Directory yet.

## Official Codex Plugin Model

The current Codex plugin docs describe plugins as reusable bundles of:

- skills
- app integrations
- MCP servers

The current docs also describe marketplace-driven installation. Codex can read
plugins from:

- the curated marketplace behind the official Plugin Directory
- `$REPO_ROOT/.agents/plugins/marketplace.json`
- `$REPO_ROOT/.claude-plugin/marketplace.json`
- `~/.agents/plugins/marketplace.json`

Installed plugins are copied into:

- `~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/`

For local plugins, the version segment becomes `local`.

## Required Package Shape

Every plugin must contain:

- `.codex-plugin/plugin.json`

Optional bundled components live at the plugin root:

- `skills/`
- `.app.json`
- `.mcp.json`
- `assets/`

The current docs explicitly say that only `plugin.json` belongs inside
`.codex-plugin/`.

## Manifest Fields Commonly Used For Published Plugins

The minimal requirement is the manifest file itself, but the current Codex
"Build plugins" docs show a richer manifest for published plugins. The main
fields called out there are:

- identity: `name`, `version`, `description`
- publisher metadata: `author`, `homepage`, `repository`, `license`,
  `keywords`
- bundled component paths: `skills`, `mcpServers`, `apps`
- install-surface metadata under `interface`

The docs specifically call out these `interface` fields:

- `displayName`
- `shortDescription`
- `longDescription`
- `developerName`
- `category`
- `capabilities`
- `websiteURL`
- `privacyPolicyURL`
- `termsOfServiceURL`
- `defaultPrompt`
- `brandColor`
- `composerIcon`
- `logo`
- `screenshots`

Practical implication:

- a locally installable plugin can exist with much less metadata
- a polished plugin intended for broad distribution should fill most or all of
  those fields

## Marketplace Requirements

The current docs describe a marketplace as a JSON catalog of plugins that Codex
can install.

For marketplace entries, the docs say to always include:

- `policy.installation`
- `policy.authentication`
- `category`

The docs also say:

- keep `source.path` relative to the marketplace root
- start local paths with `./`
- keep local paths inside the marketplace root when possible

Git-backed marketplace entries are also documented, including `url`,
`git-subdir`, `ref`, and `sha`-style sources.

Practical implication:

- Noter does not need the official OpenAI marketplace to test or share a plugin
- a repo-local marketplace would be enough to validate install flow and
  distribution shape

## Current Repo State

As of this audit on April 22, 2026, this repository does not yet contain:

- a `plugins/` directory
- any `.codex-plugin/plugin.json`
- any repo marketplace at `.agents/plugins/marketplace.json`
- any `.app.json` or `.mcp.json` for a plugin package

What the repo does already have:

- public privacy and terms pages that could plausibly back plugin legal links:
  - `apps/noter/src/content/privacy-policy.md`
  - `apps/noter/src/content/terms-of-service.md`
  - generated public pages at `apps/noter/public/privacy/index.html` and
    `apps/noter/public/terms/index.html`

So the repo is not "almost publishable" yet. It is still at the pre-package
stage.

## What Noter Still Needs Before Internal Distribution

To ship a working plugin through a repo or personal marketplace, Noter still
needs at least:

1. A plugin root, for example `plugins/noter/`
2. A real `.codex-plugin/plugin.json`
3. At least one bundled capability that justifies the plugin:
   - one or more `skills/`
   - or an `.app.json`
   - or an `.mcp.json`
4. A marketplace file:
   - repo-local at `.agents/plugins/marketplace.json`
   - or personal at `~/.agents/plugins/marketplace.json`
5. A local install test in Codex:
   - plugin appears in the directory
   - plugin installs cleanly
   - auth/setup prompts behave correctly
   - at least one bundled workflow runs end to end

For repo-local scaffolding, the existing local `plugin-creator` skill appears to
match this workflow well. It can create:

- `plugins/<plugin-name>/.codex-plugin/plugin.json`
- optional companion folders/files
- `.agents/plugins/marketplace.json`

## What Noter Still Needs Before A Stronger "Published Plugin Package"

Even before the official public directory is available, a stronger distribution
package would still want:

- a stable plugin name and versioning policy
- filled publisher metadata
- a public plugin landing page or product page
- visual assets:
  - icon
  - logo
  - screenshots
- truthful install-surface copy
- a defined category and capability list
- at least one polished default prompt
- a clear support path for plugin users

Practical implication:

- Noter's existing legal pages reduce one part of the work
- but the plugin-specific presentation layer and package metadata are still
  missing

## Remaining External Blocker

The official Codex plugin docs currently say:

- "Adding plugins to the official Plugin Directory is coming soon."
- "Self-serve plugin publishing and management are coming soon."

That means the remaining blocker for official public publication is not a repo
gap alone. It is also a platform availability gap.

## Recommended Next Steps

If the goal is to get publication-ready as far as possible before OpenAI opens
public submission, the highest-leverage sequence is:

1. Create a repo-local plugin package under `plugins/noter/`
2. Add a repo marketplace at `.agents/plugins/marketplace.json`
3. Fill a real manifest with:
   - legal links
   - website URL
   - display metadata
   - screenshots and icons
4. Decide the initial bundled capability:
   - a Noter workflow skill
   - a Noter app mapping
   - or an MCP server integration
5. Install and validate it in Codex from the local marketplace
6. Re-check the official Codex plugin docs before any public submission attempt

## Practical Readiness Summary

### Internal or team distribution

Possible now, once the package and marketplace files exist.

### Git-backed or private marketplace distribution

Possible now, once the package exists and the source URL or marketplace repo is
set up.

### Official public Plugin Directory publication

Not self-serve yet, based on the current official Codex docs.

## Sources

- OpenAI Codex Plugins overview:
  https://developers.openai.com/codex/plugins
- OpenAI Codex Build plugins:
  https://developers.openai.com/codex/plugins/build
