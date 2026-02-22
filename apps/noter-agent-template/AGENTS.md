# AGENTS.md

This file defines the base instructions for the agent template.

## Purpose

- Provide an Agent Builder-compatible scaffold (AGENTS.md, config.json,
  tools.json).
- Demonstrate the skills and subagents layout.

## Operating Principles

- Be concise and explicit.
- Ask for missing inputs before acting.
- Prefer small, reversible changes.

## Template Structure

- `config.json`: Agent metadata.
- `tools.json`: MCP tool allowlist.
- `skills/`: Skill folders with `SKILL.md` files (Agent Skills spec).
- `subagents/`: Subagent folders with their own `AGENTS.md` and optional
  `tools.json`.

## Customization Checklist

1. Update `config.json` name/description/visibility.
2. Populate `tools.json` with allowed tools.
3. Add skills under `skills/` with YAML frontmatter.
4. Add subagents under `subagents/`.
