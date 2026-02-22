# 021 Agent Builder Template Spec

## Purpose

Capture the public standards and export format used by LangSmith Agent Builder
so Noter can add an "agent" template alongside the existing "app" template.

## Scope

This spec documents the observed file layout and field shapes from Agent Builder
export packages, the AGENTS.md standard, the Agent Skills specification, and
subagent conventions as described in public docs.

## Sources Reviewed

- LangSmith Agent Builder webhooks export documentation
- LangChain blog post on Agent Builder memory system
- AGENTS.md standard site
- Agent Skills specification site
- Claude Code subagent documentation (for comparison)

## Export Package Layout (Webhook ZIP)

Agent Builder exports a ZIP payload with a conventional file layout.

Required root files:

- `AGENTS.md`
- `config.json`
- `tools.json`

Optional directories:

- `skills/` with one or more `skill-name/` folders
- `subagents/` with one or more `<subagent>/` folders

Optional files within directories:

- `skills/<skill-name>/SKILL.md` is required for each skill
- `subagents/<subagent>/AGENTS.md` is required for each subagent
- `subagents/<subagent>/tools.json` is optional but supported

## AGENTS.md Standard

- AGENTS.md is a plain Markdown instruction file used to configure agent
  behavior.
- It is an open standard and is not tied to a single vendor.
- Nested AGENTS.md files are supported for scoped instructions in
  subdirectories.

## Agent Skills Standard

- Skills are structured as folders with a required `SKILL.md`.
- `SKILL.md` must include YAML frontmatter with required `name` and
  `description` fields.
- Optional fields exist in the spec, but the required fields are the
  interoperability baseline.
- Optional subdirectories include `scripts/`, `references/`, and `assets/`.

## tools.json (Agent Builder)

Agent Builder uses a custom `tools.json` file format to control MCP tool access
and avoid loading entire servers.

Observed fields:

- `tools`: array of tool descriptors
- Each tool descriptor includes:
  - `name`
  - `mcp_server_url`
  - `mcp_server_name`
  - `display_name`
- `interrupt_config`: object keyed by
  `mcp_server_url::tool_name::mcp_server_name` with boolean values

Notes:

- This is explicitly not the same as a generic `mcp.json` or full MCP server
  manifest.
- The intent is to list only a subset of tools per MCP server.

## config.json (Agent Builder)

Agent Builder includes a `config.json` file with agent metadata and execution
state.

Observed fields:

- `name`
- `description`
- `visibility_scope`
- `triggers_paused`

Notes:

- Public docs show an example but do not publish a formal JSON schema.

## Subagents

- There is no formal industry standard for subagents.
- Agent Builder uses a convention similar to Claude Code, with subagent folders
  containing `AGENTS.md` and optional `tools.json`.
- Claude Code subagents are Markdown files with YAML frontmatter and a prompt
  body, which is not identical to Agent Builder's folder layout but is
  consistent in spirit.

## Validation Expectations (Practical)

- Agent Builder validates file shapes at import time.
- Skills must include valid frontmatter with required fields.
- Tools configuration must reference valid MCP servers.

## Open Questions

- Whether Agent Builder accepts additional config fields beyond the documented
  example.
- Whether `tools.json` accepts fields beyond the documented example.
- Whether subagents allow skill references or nested skills.

## Implications for Noter

- An "agent" template should include `AGENTS.md`, `config.json`, and
  `tools.json` at the root.
- A `skills/` directory should be supported with `SKILL.md`-based skills.
- A `subagents/` directory should be supported with nested `AGENTS.md` and
  optional `tools.json`.
- The template should avoid emitting `mcp.json` and instead align with Agent
  Builder's `tools.json` layout.

## Reference Links

- https://docs.langchain.com/langsmith/agent-builder-webhooks
- https://blog.langchain.com/how-we-built-agent-builders-memory-system/
- https://agents.md/
- https://agentskills.io/specification
- https://docs.claude.com/en/docs/claude-code/subagents
