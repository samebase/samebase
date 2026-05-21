# Simple View Frontmatter Specification (Pilot 1)

## Document Control

- Status: Proposed
- Owner: Noter frontend/editor UX
- Date: 2026-02-13
- Related files:
  - `/Users/nicu/dev/my/noter/noter.md`
  - `/Users/nicu/dev/my/noter/apps/noter/src/components/FileView.tsx`
  - `/Users/nicu/dev/my/noter/apps/noter/src/components/FileTree.tsx`
  - `/Users/nicu/dev/my/noter/apps/noter/src/components/CommandPalette.tsx`

## Summary

Introduce a per-vault "Simple View" that hides source/dev files using patterns defined in `noter.md`
YAML frontmatter.

The goal is an agent-building view where non-essential implementation files are hidden, while
agent-facing files (for example `AGENTS.md` and tool/skill config files) remain easier to navigate.

This spec also adds a Sidebar toggle to switch between:

1. `Simple View` (filtered)
2. `All Files` (unfiltered)

## Goals

1. Make repository navigation cleaner for agent-oriented workflows.
2. Keep configuration human-readable and LLM-readable in markdown.
3. Validate frontmatter into typed TypeScript objects before applying filters.
4. Keep behavior safe by failing open (show all files) when config is missing/invalid.
5. Keep filtering consistent between Sidebar tree and Cmd+P.

## Non-Goals

1. No backend schema/API changes in this iteration.
2. No dashboard-level filtering in this iteration.
3. No strict access control; this is a view filter only.
4. No TOON adoption for frontmatter; YAML remains the format for this feature.

## Product Decisions (Locked)

1. Config source: root `noter.md` frontmatter.
2. Pattern model: `exclude` glob patterns.
3. Default mode: `Simple View` when config exists (unless user has a saved preference).
4. Preference persistence: per vault in localStorage.
5. Scope: apply filtering to Sidebar tree and Cmd+P.
6. Fallback on invalid/missing config: show all files.

## Frontmatter Contract

### Required format

- YAML frontmatter at the top of `noter.md`.
- Block style values (one item per line) is preferred.
- Inline comments are allowed and encouraged for human/LLM clarity.

Example:

```md
---
simpleView:
  exclude:
    - apps/**/src/** # UI source code
    - apps/**/convex/** # Convex backend functions
    - .codespace-agent/** # Local codespace helper code
    - node_modules/** # Dependencies
    - dist/** # Build output
    - "**/*.{ts,tsx,js,jsx,css,html}" # Source file extensions
---
```

### Notes on comments

1. YAML frontmatter supports end-of-line comments (`# ...`).
2. Comments are for readability only and are not preserved in parsed TypeScript objects.

## Parsing and Validation Contract

1. Parse only the first YAML frontmatter block in `noter.md`.
2. Validate with a typed runtime schema (Zod) before use.
3. Supported shape for this iteration:

```ts
{
  simpleView?: {
    exclude?: string[];
  };
}
```

4. Invalid YAML or schema mismatch must not break file navigation.
5. On parse/validation failure, treat as no filter (show all files).

## Data Flow and Behavior

1. Build the existing tree state as today (Git tree + staging overlays).
2. Resolve `noter.md` content source with this precedence:
   - staged `noter.md` if present and not deleted;
   - otherwise repository `noter.md` content;
   - otherwise no config.
3. Parse and validate frontmatter.
4. Compute `visibleTreeData`:
   - when Simple View is on: apply exclude patterns;
   - when off: return full tree.
5. Use `visibleTreeData` for:
   - Sidebar file tree;
   - Cmd+P file list.
6. Direct URL navigation to a hidden file is still allowed; filter affects browsing lists only.

## Sidebar Toggle Contract

1. Add a toggle in Sidebar repo controls to switch:
   - `Simple View`
   - `All Files`
2. Initial state resolution:
   - if localStorage has saved per-vault preference, use it;
   - else if `noter.md` exists, default to `Simple View = on`;
   - else default `off`.
3. Persist preference per vault:
   - key format: `noter-simple-view:<vaultId>`.

## Important Interface and Type Additions

1. New frontend utility module for config parsing and filtering.
2. New typed config result shape, for example:

```ts
type SimpleViewConfig = {
  hasConfigFile: boolean;
  hasValidConfig: boolean;
  excludePatterns: string[];
  error?: string;
};
```

3. New pure helper functions for:
   - parsing frontmatter config;
   - matching glob exclusions;
   - filtering tree items.

No public backend API contract changes are required.

## Acceptance Criteria

1. A repo with valid `noter.md` frontmatter defaults to Simple View on first load.
2. Sidebar shows filtered files when Simple View is on.
3. Cmd+P shows the same filtered file set.
4. Toggle state persists per vault after page reload.
5. Invalid `noter.md` frontmatter does not crash UI and falls back to all files.
6. YAML inline comments in frontmatter parse correctly (data unaffected).

## Test Cases and Scenarios

1. Parsing:
   - valid YAML with inline comments;
   - missing frontmatter;
   - malformed YAML;
   - wrong types (`exclude: "apps/**"`).
2. Filtering:
   - exclude directory glob;
   - exclude extension glob;
   - mixed include-by-default behavior for unmatched files.
3. UI behavior:
   - first load defaults;
   - per-vault persistence;
   - toggle updates tree + Cmd+P together;
   - direct URL access to hidden file still opens editor.

## Assumptions and Defaults

1. `noter.md` lives at repository root.
2. YAML frontmatter remains the canonical settings format for this feature.
3. Filtering is presentation-only; it does not affect commits, staging, or Git operations.
4. Dashboard-wide "show more/less dev stuff" is deferred to a follow-up iteration.

## Future Follow-ups

1. Optional app-level global default for Simple View in addition to per-vault preference.
2. Optional schema expansion for explicit include rules.
3. Optional diagnostics UI for invalid frontmatter errors.
