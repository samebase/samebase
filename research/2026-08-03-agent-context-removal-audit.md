# Agent Context Removal Audit

## Document Control

- Status: Current removal decision
- Date: 2026-08-03
- Supersedes the runtime and packaging direction in the 2026-05-23 agent-context research series
- Related: `packages/plugin/`, `skills/update-samebase-agent-plugin/SKILL.md`

## Decision

Remove `packages/agent-context` in full. Do not treat its old research, package shape, manifest, or
skills as current agent guidance. The package was a validated experiment, but it never became part
of the live agent runtime.

Do not copy package content into the public Samebase plugin. Let a held-out project adoption expose
specific missing Samebase knowledge before adding new public guidance.

## Evidence

Three independent read-only audits reviewed live integration, file-level value, and public-plugin
value with removal as the default.

- The package had no loader, exports, executable, tests, runtime dependency, or installed skill.
- Its only package check was document formatting.
- Its manifest said that it did not replace live `AGENTS.md` routing.
- Previous forward tests passed package files to agents manually. They had no no-skill baseline and
  excluded live provider setup, browser automation, backend startup, and provider mutations.
- Current `AGENTS.md`, active repo skills, docs, accepted specs, code, and tests own the useful
  rules with stronger and more current contracts.
- Some package guidance had drifted. The operator overlay treated the retired `ship` and `archive`
  commands as direct actions, used a manual PR build-label formula instead of the required script,
  and the Convex overlay preferred `find` and `grep` instead of the current `rg` rule.
- The package did not describe the current Samebase adoption actions or provider repair contracts.

The audits found no file with enough unique and reachable value to keep. A small prompt-evaluation
method was the only extraction candidate. The active plugin-maintenance skill already has a stronger
fixed-input, cross-model forward-test contract, and the older research remains the evidence trail.

## Current Owners

- `AGENTS.md` owns broad, stable repository rules.
- Active repo skills own conditional Samebase workflows.
- Docs and accepted specs own detailed workflow and product contracts.
- Code and tests own current behavior.
- `packages/plugin` owns public Samebase agent distribution.
- The 2026-05-23 research series remains historical evidence only.

## Next Test

Run the Weight TSX adoption with the public Samebase plugin, current MCP and action contracts, and
the target repository. Record demonstrated failures. Add only the smallest Samebase-specific rule
that fixes a verified failure. Improve the public action contract instead of the skill when the
missing information is an action fact.
