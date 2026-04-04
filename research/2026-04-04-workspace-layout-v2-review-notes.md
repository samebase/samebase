# Workspace Layout V2 Review Notes

This is a temporary working file for manual review feedback on the v2 workspace
layout code. We can refine and relocate the durable parts into `AGENTS.md` or a
dedicated skill after the review settles down.

This file is intentionally not source-of-truth product documentation.

## Current Notes

- Prefer direct React imports such as `useState` and `useEffect` over
  `React.useState` and `React.useEffect`.
- Prefer positive ternary conditions over negated ones. When both branches are
  valid, rewrite `!condition ? a : b` as `condition ? b : a`.
