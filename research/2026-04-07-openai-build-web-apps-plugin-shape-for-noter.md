# OpenAI Build Web Apps Plugin Shape For Noter

Date: 2026-04-07

## Why This Document Exists

OpenAI's curated `build-web-apps` plugin is a useful reference for how Codex
plugins can package a focused product workflow instead of a generic toolbox.

This note captures:

1. how `build-web-apps` is actually implemented in `openai/plugins`
2. which parts of that shape are worth copying for `noter.md`
3. which parts should change because Noter's architecture is different

## Sources Reviewed

### OpenAI reference plugin

- [`plugins/build-web-apps/.codex-plugin/plugin.json`](https://github.com/openai/plugins/blob/main/plugins/build-web-apps/.codex-plugin/plugin.json)
- [`plugins/build-web-apps/.mcp.json`](https://github.com/openai/plugins/blob/main/plugins/build-web-apps/.mcp.json)
- [`plugins/build-web-apps/agents/openai.yaml`](https://github.com/openai/plugins/blob/main/plugins/build-web-apps/agents/openai.yaml)
- [`plugins/build-web-apps/README.md`](https://github.com/openai/plugins/blob/main/plugins/build-web-apps/README.md)
- [`plugins/build-web-apps/skills/`](https://github.com/openai/plugins/tree/main/plugins/build-web-apps/skills)

### Noter constraints and adjacent work

- [specs/043_REMOTE_MCP_OAUTH_PROVIDER_CONVEX_ARCHITECTURE_SPEC.md](../specs/043_REMOTE_MCP_OAUTH_PROVIDER_CONVEX_ARCHITECTURE_SPEC.md)
- [specs/047_UNIFIED_TOOL_RUNTIME_AND_SURFACE_ADAPTERS_SPEC.md](../specs/047_UNIFIED_TOOL_RUNTIME_AND_SURFACE_ADAPTERS_SPEC.md)
- [specs/062_MCP_DUAL_ORIGIN_CONSENT_LOGIN_REDIRECT_SPEC.md](../specs/062_MCP_DUAL_ORIGIN_CONSENT_LOGIN_REDIRECT_SPEC.md)
- [rfcs/073_CODEX_PLUGIN_CONNECTED_MACHINE_ONBOARDING_RESEARCH.md](../rfcs/073_CODEX_PLUGIN_CONNECTED_MACHINE_ONBOARDING_RESEARCH.md)
- [specs/076_CONNECTED_MACHINE_REGISTRATION_AND_PRESENCE_ROLLOUT_SPEC.md](../specs/076_CONNECTED_MACHINE_REGISTRATION_AND_PRESENCE_ROLLOUT_SPEC.md)
- [apps/noter-starter-template/README.md](../apps/noter-starter-template/README.md)
- [apps/noter-agent-template/AGENTS.md](../apps/noter-agent-template/AGENTS.md)

## Observed Shape Of `build-web-apps`

## 1. It is a standard Codex plugin folder, not a special runtime

The OpenAI plugin uses the normal Codex plugin packaging model:

- `.codex-plugin/plugin.json`
- `.mcp.json`
- `agents/openai.yaml`
- `skills/`
- `assets/`

There is no bespoke application runtime inside the plugin itself. The plugin is
mostly metadata plus skills plus MCP dependency declarations.

## 2. The product is encoded in skills, not in code generation logic

`build-web-apps` is not implemented as one giant master prompt. The plugin is a
bundle of narrower skills:

- `deploy-to-vercel`
- `frontend-skill`
- `react-best-practices`
- `shadcn-best-practices`
- `stripe-best-practices`
- `supabase-best-practices`
- `web-design-guidelines`

This is the key pattern worth copying. The plugin is really a curated workflow
surface over a family of sub-problems.

## 3. MCP dependencies are declared at the plugin level

The plugin-level `.mcp.json` declares three remote MCP servers:

- Stripe
- Vercel
- Supabase

`agents/openai.yaml` repeats the same dependency information in an agent-facing
format. The metadata is partially duplicated across:

- `.codex-plugin/plugin.json`
- `agents/openai.yaml`
- `.mcp.json`

That duplication appears intentional. `plugin.json` drives discovery and UI,
`openai.yaml` describes the agent surface, and `.mcp.json` is the actual MCP
bundle.

## 4. The skills mix lightweight playbooks and heavyweight reference packs

The skill directories are not all the same shape:

- some are small, single-file playbooks
- some include large reference payloads
- `react-best-practices` includes `AGENTS.md`, `README.md`, `metadata.json`, and
  a `rules/` directory
- `stripe-best-practices` carries a `references/` directory
- `frontend-skill` even has its own `agents/openai.yaml`

So the implementation pattern is not "one prompt file per capability." The real
pattern is "small plugin shell, rich skill payloads where needed."

## 5. The plugin is intentionally vertical

The chosen dependencies and skills line up around one product story:

1. build the UI
2. improve the React implementation
3. use common design-system patterns
4. handle deployment
5. handle payments
6. handle the database

That is why the plugin feels coherent. It is not a generic list of popular web
technologies.

## 6. The README under-describes the actual payload

The plugin `README.md` lists six skills, but the repo currently also contains
`frontend-skill`, which is not called out in that list. That suggests the repo
layout is a more reliable source of truth than the README summary when the two
diverge.

## What Is Worth Copying For Noter

The parts worth copying directly are:

1. one vertically scoped plugin instead of a generic Noter plugin catalog
2. a normal Codex plugin shell with manifest, MCP manifest, agent metadata, and
   skill folders
3. multiple focused skills instead of one large builder prompt
4. technology choices expressed through skill bundles and MCP dependencies
5. optional heavyweight references only where a sub-domain truly needs them

## What Should Not Be Copied Literally

A literal port of the dependency model would be the wrong fit for Noter.

`build-web-apps` talks directly to third-party MCP servers for Stripe, Vercel,
and Supabase. Noter's current architecture points the other way:

1. [specs/043](../specs/043_REMOTE_MCP_OAUTH_PROVIDER_CONVEX_ARCHITECTURE_SPEC.md)
   wants a hosted Noter MCP server backed by Convex
2. [specs/047](../specs/047_UNIFIED_TOOL_RUNTIME_AND_SURFACE_ADAPTERS_SPEC.md)
   wants one canonical tool runtime in Convex shared by agent, MCP, and UI
3. [rfcs/073](../rfcs/073_CODEX_PLUGIN_CONNECTED_MACHINE_ONBOARDING_RESEARCH.md)
   and
   [specs/076](../specs/076_CONNECTED_MACHINE_REGISTRATION_AND_PRESENCE_ROLLOUT_SPEC.md)
   keep hosted plugin auth separate from local machine auth

So the right Noter equivalent is:

- same plugin packaging pattern
- different dependency boundary

The plugin should primarily depend on a first-party Noter MCP server, not on raw
provider MCP servers wired directly into the plugin.

## Recommended Noter Equivalent

## Summary

Build a Noter plugin that copies the `build-web-apps` packaging model but swaps
the dependency model and skills for Noter's stack:

- React 18
- Vite
- React Router 7
- Convex
- Tailwind CSS
- shadcn/ui
- Cloudflare
- GitHub
- Noter connected-machine workflows when local preview or device control is
  needed

## Dependency mapping

| `build-web-apps` piece  | Why it exists                         | Recommended Noter equivalent                                                                    |
| ----------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Vercel MCP              | deploys, previews, hosting operations | Noter-hosted MCP tools for Cloudflare preview/status/logs and vault branch metadata             |
| Supabase MCP            | database design and inspection        | Noter-hosted MCP tools for Convex status/logs/data proposals and schema-aware backend workflows |
| Stripe MCP              | payments and billing                  | omit from the first Noter builder plugin unless billing work is explicitly in scope             |
| React/Next.js skill     | frontend implementation guidance      | React 18 + Vite + React Router 7 skill                                                          |
| shadcn skill            | component usage rules                 | Noter-specific shadcn wrapper and generated-file rules                                          |
| web-design review skill | UI audit                              | route-first Playwright/live review skill aligned with Noter UI guardrails                       |
| deploy-to-vercel skill  | shipping path                         | Cloudflare preview plus GitHub PR plus local machine preview workflow                           |

## Recommended plugin boundary

The plugin should expose one first-party MCP dependency:

```json
{
  "mcpServers": {
    "noter": {
      "type": "http",
      "url": "https://api.noter.md/mcp"
    }
  }
}
```

That keeps:

1. approval policy in Noter
2. audit policy in Noter
3. provider-token handling in Noter
4. tool naming consistent with the shared runtime direction in
   [specs/047](../specs/047_UNIFIED_TOOL_RUNTIME_AND_SURFACE_ADAPTERS_SPEC.md)

If Noter later decides to expose direct Cloudflare or GitHub MCP dependencies,
that should be a later optimization, not the starting point.

## Recommended skill set

The closest Noter-native equivalent would be a plugin with skills like:

1. `build-with-noter`
   - umbrella routing skill for Noter app-building work
2. `vite-react-router-best-practices`
   - frontend structure, routing, loading, and data-flow guidance
3. `convex-backend-best-practices`
   - schema, auth, mutations, queries, migrations, and performance
4. `shadcn-noter-rules`
   - generated-file boundaries, wrapper usage, and styling constraints
5. `cloudflare-preview-and-ops`
   - Pages previews, deploy status, logs, and branch preview behavior
6. `route-first-ui-review`
   - live app repros, screenshot coverage, focus/scroll/touch regressions
7. `connected-machine-local-preview`
   - when the work needs machine-scoped local inspection or future tunnel
     control

The important part is not the exact names. The important part is that the skill
set follows the same vertical-product pattern as `build-web-apps`.

## Minimal proposed folder shape

```text
plugins/noter-web-apps/
  .codex-plugin/plugin.json
  .mcp.json
  agents/
    openai.yaml
  assets/
  skills/
    build-with-noter/
      SKILL.md
    vite-react-router-best-practices/
      SKILL.md
      references/
    convex-backend-best-practices/
      SKILL.md
      references/
    shadcn-noter-rules/
      SKILL.md
    cloudflare-preview-and-ops/
      SKILL.md
    route-first-ui-review/
      SKILL.md
    connected-machine-local-preview/
      SKILL.md
```

## Why One First-Party MCP Server Is Better For Noter

This is the biggest architectural difference from OpenAI's plugin.

OpenAI's plugin is a curated frontend bundle over external MCP servers. Noter's
direction is a curated workflow surface over Noter's own hosted tool runtime.

That is a better fit for Noter because it preserves all three of these product
constraints:

1. approvals stay server-enforced
2. audit trails stay centralized
3. plugin auth and machine auth stay separate

It also fits the current plan to share the same tool runtime across:

1. Noter chat agent
2. MCP clients
3. Noter UI actions

That shared-runtime goal is explicit in
[specs/047](../specs/047_UNIFIED_TOOL_RUNTIME_AND_SURFACE_ADAPTERS_SPEC.md).

## Readiness Gap

The packaging pattern can be copied immediately, but the runtime breadth cannot.

Today, Noter's MCP surface is still comparatively narrow, and
[specs/047](../specs/047_UNIFIED_TOOL_RUNTIME_AND_SURFACE_ADAPTERS_SPEC.md)
describes the broader shared runtime as proposed work. That means:

1. the plugin shell could be created now
2. the credible long-term plugin value depends on expanding the first-party MCP
   tool catalog

So the blocker is not plugin packaging. The blocker is shared tool coverage.

## Recommendation

Recommendation: copy the `build-web-apps` plugin's shape, not its exact vendor
choices.

That means:

1. create one vertically scoped Noter builder plugin
2. keep the standard Codex plugin shell
3. make skills the main product payload
4. point the plugin at a first-party Noter MCP server
5. keep local machine workflows explicitly separate from hosted plugin auth
6. expand the shared Noter MCP/runtime surface before adding many plugin-local
   dependencies

If we do that, the result is "the same thing for Noter" in the way that matters:
one coherent builder plugin with a clear product story, but grounded in
Cloudflare, Convex, React Router/Vite, and Noter's own approval and machine
model instead of Vercel, Supabase, and Stripe.
