# Noter App Template Overlay Draft

## Purpose

This overlay is for `notermd/app` and generated apps derived from it. It is not a general Noter
operator workflow and not portable agent core.

## Rules

- Treat `notermd/app` as the generated app source of truth.
- Let Noter export and seed the app; let `notermd/app` own generated app content.
- Remove unwanted generated-app files upstream in `notermd/app`, not by filtering them out in Noter.
- Do not filter files by path in Noter just because they look agent-, docs-, or research-related.
  First prove they are Noter-owned rather than `notermd/app`-owned.
- Do not add Noter-only overlays, prompt fragments, or research artifacts to generated app output.
- Preserve one bytewise path comparator, or a proven equivalent, across exporter traversal, manifest
  hashing, generated object ordering, binary blob creation, and runtime tree entries.
- Preserve binary content, text content, file modes, branch selection, explicit token config, and
  manifest provenance.
- Preserve the generated app's real build command; do not substitute a Noter-side default unless the
  template contract has changed.
- Validate template behavior through the actual app-creation or generated-app build path.
- When mutation or build validation is disallowed, inspect the real app-creation path and tests,
  then record the unrun generated-app build as an open validation gap.
- Keep Cloudflare-first and Convex assumptions only where the template currently owns them.

## Research Notes

Derived from `research/2026-05-23-agent-context-experiment-results-5.md`.
